"""Thin subprocess wrapper around FFmpeg / FFprobe."""

from __future__ import annotations

import json
import logging
import re
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _run_ffmpeg(args: list[str]) -> subprocess.CompletedProcess[str]:
    """Execute an FFmpeg/FFprobe command and return the completed process.

    Raises ``RuntimeError`` on non-zero exit codes or if the executable
    is not found.
    """
    log.debug("Running: %s", " ".join(args))
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        exe = args[0] if args else "ffmpeg"
        raise RuntimeError(
            f"'{exe}' not found. Please install FFmpeg and ensure it is on your PATH. "
            f"Download from https://ffmpeg.org/download.html"
        ) from None
    if result.returncode != 0:
        log.error("FFmpeg stderr:\n%s", result.stderr)
        raise RuntimeError(
            f"FFmpeg command failed (rc={result.returncode}): {' '.join(args)}\n"
            f"{result.stderr}"
        )
    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_ffprobe_info(file_path: str) -> dict:
    """Return audio metadata for *file_path* via ``ffprobe``.

    Returns a dict with keys: ``duration``, ``sample_rate``, ``channels``,
    ``codec``, and ``bit_rate``.
    """
    args = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path,
    ]
    result = _run_ffmpeg(args)
    probe: dict = json.loads(result.stdout)

    audio_stream: dict | None = None
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == "audio":
            audio_stream = stream
            break

    if audio_stream is None:
        raise RuntimeError(f"No audio stream found in {file_path}")

    fmt = probe.get("format", {})
    return {
        "duration": float(fmt.get("duration", audio_stream.get("duration", 0))),
        "sample_rate": int(audio_stream.get("sample_rate", 0)),
        "channels": int(audio_stream.get("channels", 0)),
        "codec": audio_stream.get("codec_name", "unknown"),
        "bit_rate": int(fmt.get("bit_rate", audio_stream.get("bit_rate", 0))),
    }


def detect_silence(
    file_path: str,
    threshold_db: float,
    min_duration: float,
) -> list[dict]:
    """Run the ``silencedetect`` audio filter and return silence regions.

    Each element is ``{"start": float, "end": float, "duration": float}``.
    """
    args = [
        "ffmpeg",
        "-i", file_path,
        "-af", f"silencedetect=noise={threshold_db}dB:d={min_duration}",
        "-f", "null",
        "-",
    ]
    try:
        result = subprocess.run(args, capture_output=True, text=True)
    except FileNotFoundError:
        raise RuntimeError(
            "'ffmpeg' not found. Please install FFmpeg and ensure it is on your PATH. "
            "Download from https://ffmpeg.org/download.html"
        ) from None
    if result.returncode != 0:
        log.error("FFmpeg stderr:\n%s", result.stderr)
        raise RuntimeError(
            f"FFmpeg silencedetect failed (rc={result.returncode}): {' '.join(args)}\n"
            f"{result.stderr}"
        )
    # silencedetect writes to stderr regardless of exit code
    output = result.stderr

    starts: list[float] = []
    ends: list[float] = []
    durations: list[float] = []

    for line in output.splitlines():
        m_start = re.search(r"silence_start:\s*([\d.]+)", line)
        if m_start:
            starts.append(float(m_start.group(1)))

        m_end = re.search(
            r"silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)", line,
        )
        if m_end:
            ends.append(float(m_end.group(1)))
            durations.append(float(m_end.group(2)))

    if len(starts) != len(ends) or len(starts) != len(durations):
        log.warning(
            "Silence boundary mismatch: starts=%d, ends=%d, durations=%d – "
            "detection may be unreliable",
            len(starts), len(ends), len(durations),
        )

    segments: list[dict] = []
    for i, start in enumerate(starts):
        end = ends[i] if i < len(ends) else start
        dur = durations[i] if i < len(durations) else end - start
        segments.append({"start": start, "end": end, "duration": dur})

    log.info("Detected %d silence segments in %s", len(segments), file_path)
    return segments


def extract_segment(
    input_path: str,
    output_path: str,
    start: float,
    end: float,
) -> None:
    """Extract the time range [*start*, *end*) from *input_path*."""
    duration = end - start
    _run_ffmpeg([
        "ffmpeg", "-y",
        "-ss", str(start),
        "-t", str(duration),
        "-i", input_path,
        "-c", "copy",
        output_path,
    ])
    log.debug("Extracted segment %.2f–%.2f → %s", start, end, output_path)


def normalize_audio(input_path: str, output_path: str) -> None:
    """Apply the EBU R128 ``loudnorm`` filter."""
    _run_ffmpeg([
        "ffmpeg", "-y",
        "-i", input_path,
        "-af", "loudnorm",
        output_path,
    ])
    log.debug("Normalized %s → %s", input_path, output_path)


def apply_highpass(input_path: str, output_path: str, freq: int = 80) -> None:
    """Apply a highpass filter at *freq* Hz."""
    _run_ffmpeg([
        "ffmpeg", "-y",
        "-i", input_path,
        "-af", f"highpass=f={freq}",
        output_path,
    ])
    log.debug("Highpass (%d Hz) %s → %s", freq, input_path, output_path)


def concat_segments(
    segment_paths: list[str],
    output_path: str,
    crossfade_ms: int = 50,
) -> None:
    """Concatenate multiple audio files with a crossfade.

    Uses the ``acrossfade`` filter when there are exactly two inputs and falls
    back to the concat demuxer for longer lists (crossfade applied pairwise
    via a filter chain).
    """
    if not segment_paths:
        raise ValueError("segment_paths must not be empty")

    if len(segment_paths) == 1:
        # Nothing to concatenate – just copy.
        _run_ffmpeg(["ffmpeg", "-y", "-i", segment_paths[0], "-c", "copy", output_path])
        return

    crossfade_s = crossfade_ms / 1000.0

    # Build a complex filtergraph that pairwise crossfades all inputs.
    inputs: list[str] = []
    for path in segment_paths:
        inputs.extend(["-i", path])

    n = len(segment_paths)
    filter_parts: list[str] = []
    prev_label = "[0:a]"

    for i in range(1, n):
        cur_label = f"[{i}:a]"
        out_label = f"[a{i}]" if i < n - 1 else "[out]"
        filter_parts.append(
            f"{prev_label}{cur_label}acrossfade=d={crossfade_s}:c1=tri:c2=tri{out_label}"
        )
        prev_label = out_label

    filter_graph = ";".join(filter_parts)

    _run_ffmpeg([
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_graph,
        "-map", "[out]",
        output_path,
    ])
    log.info("Concatenated %d segments → %s", n, output_path)


def encode_output(input_path: str, output_path: str, fmt: str) -> None:
    """Encode *input_path* to *output_path* in the given format.

    Supported formats: ``wav``, ``mp3``, ``flac``.
    """
    codec_map: dict[str, list[str]] = {
        "wav": ["-c:a", "pcm_s16le"],
        "mp3": ["-c:a", "libmp3lame", "-q:a", "2"],
        "flac": ["-c:a", "flac"],
    }
    codec_args = codec_map.get(fmt)
    if codec_args is None:
        raise ValueError(f"Unsupported output format: {fmt!r}")

    _run_ffmpeg([
        "ffmpeg", "-y",
        "-i", input_path,
        *codec_args,
        output_path,
    ])
    log.info("Encoded %s → %s (%s)", input_path, output_path, fmt)
