"""Sidecar entry point – newline-delimited JSON over stdin/stdout."""

from __future__ import annotations

import json
import logging
import os
import sys
import threading
from typing import Any

from sonicsift.assembly import assemble_segments
from sonicsift.chunking import plan_chunks
from sonicsift.config import ProcessingConfig
from sonicsift.detection import detect_segments
from sonicsift.enhance import get_pipeline
from sonicsift.export import export_final
from sonicsift.ingest import IngestError, validate_file

# ---------------------------------------------------------------------------
# Logging → stderr (stdout is reserved for JSON IPC)
# ---------------------------------------------------------------------------

logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cancellation support (best-effort)
# ---------------------------------------------------------------------------

_cancel_event = threading.Event()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _send(msg: dict[str, Any]) -> None:
    """Write a JSON object as a single line to stdout and flush."""
    line = json.dumps(msg, separators=(",", ":"))
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def _send_progress(job_id: str, stage: str, percent: float) -> None:
    _send({
        "type": "progress",
        "payload": {"jobId": job_id, "stage": stage, "percent": round(percent, 1)},
    })


def _send_error(job_id: str | None, message: str) -> None:
    _send({
        "type": "error",
        "payload": {"jobId": job_id or "", "message": message},
    })


def _cancelled() -> bool:
    return _cancel_event.is_set()


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

def _handle_ping() -> None:
    _send({"type": "pong", "payload": {}})


def _handle_cancel() -> None:
    _cancel_event.set()
    _send({"type": "cancelled", "payload": {}})


def _handle_analyze(payload: dict[str, Any]) -> None:
    """Ingest → chunk → detect, returning the full segment list."""
    job_id: str = payload.get("jobId", "")
    file_path: str = payload["filePath"]
    config = ProcessingConfig(**payload.get("config", {}))

    _cancel_event.clear()

    # 1. Ingest
    _send_progress(job_id, "ingest", 0)
    try:
        metadata = validate_file(file_path)
    except IngestError as exc:
        _send_error(job_id, str(exc))
        return
    _send_progress(job_id, "ingest", 100)

    if _cancelled():
        return

    # 2. Chunking
    _send_progress(job_id, "chunking", 0)
    chunks = plan_chunks(metadata["duration"], config.chunk_duration_s)
    _send_progress(job_id, "chunking", 100)

    if _cancelled():
        return

    # 3. Detection
    _send_progress(job_id, "detection", 0)
    try:
        segments = detect_segments(file_path, config)
    except Exception as exc:
        _send_error(job_id, f"Detection failed: {exc}")
        return
    _send_progress(job_id, "detection", 100)

    _send({
        "type": "analyzeResult",
        "payload": {
            "jobId": job_id,
            "metadata": metadata,
            "chunks": chunks,
            "segments": [
                {
                    "start": s.start,
                    "end": s.end,
                    "duration": s.duration,
                    "segmentType": s.segment_type,
                    "keep": s.keep,
                }
                for s in segments
            ],
        },
    })


def _handle_export(payload: dict[str, Any]) -> None:
    """Enhance → assemble → export the final cleaned audio."""
    job_id: str = payload.get("jobId", "")
    file_path: str | None = payload.get("filePath")
    output_path: str | None = payload.get("outputPath")
    if not file_path or not output_path:
        _send_error(job_id, "Missing required field: filePath or outputPath")
        return
    segment_defs: list[dict] = payload.get("segments", [])
    config = ProcessingConfig(**payload.get("config", {}))

    if not segment_defs:
        _send_error(job_id, "No segments provided for export")
        return

    _cancel_event.clear()
    work_dir = config.work_dir
    os.makedirs(work_dir, exist_ok=True)

    pipeline = get_pipeline()
    enhanced_paths: list[dict] = []
    intermediate_files: list[str] = []

    try:
        # 1. Enhance each kept segment
        total = len(segment_defs)
        for i, seg in enumerate(segment_defs):
            if _cancelled():
                return
            _send_progress(job_id, "enhance", (i / total) * 100 if total else 0)

            seg_input = os.path.join(work_dir, f"seg_{i:04d}_raw.wav")
            seg_output = os.path.join(work_dir, f"seg_{i:04d}_enh.wav")
            intermediate_files.extend([seg_input, seg_output])

            from sonicsift.ffmpeg import extract_segment
            extract_segment(file_path, seg_input, seg["start"], seg["end"])
            pipeline.process(seg_input, seg_output, config.enhancement_strength)
            enhanced_paths.append({"path": seg_output})

        _send_progress(job_id, "enhance", 100)

        if _cancelled():
            return

        # 2. Assemble
        _send_progress(job_id, "assembly", 0)
        assembled = assemble_segments(enhanced_paths, work_dir, crossfade_ms=config.crossfade_ms)
        _send_progress(job_id, "assembly", 100)

        if _cancelled():
            return

        # 3. Export
        _send_progress(job_id, "export", 0)
        final = export_final(assembled, output_path, fmt=config.output_format)
        _send_progress(job_id, "export", 100)

        _send({
            "type": "exportResult",
            "payload": {"jobId": job_id, "outputPath": final},
        })
    finally:
        for f in intermediate_files:
            try:
                os.remove(f)
            except OSError:
                pass


# ---------------------------------------------------------------------------
# Event loop
# ---------------------------------------------------------------------------

_HANDLERS: dict[str, Any] = {
    "ping": lambda _: _handle_ping(),
    "cancel": lambda _: _handle_cancel(),
    "analyze": _handle_analyze,
    "export": _handle_export,
}


def main() -> None:
    """Read newline-delimited JSON from stdin and dispatch commands."""
    log.info("SonicSift worker started – waiting for commands on stdin")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError as exc:
            _send_error(None, f"Invalid JSON: {exc}")
            continue

        cmd = msg.get("command")
        payload = msg.get("payload", {})

        handler = _HANDLERS.get(cmd)
        if handler is None:
            _send_error(None, f"Unknown command: {cmd!r}")
            continue

        try:
            handler(payload)
        except Exception as exc:
            log.exception("Unhandled error for command %r", cmd)
            _send_error(
                payload.get("jobId"),
                f"{type(exc).__name__}: {exc}",
            )


if __name__ == "__main__":
    main()
