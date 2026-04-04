"""Thin subprocess wrapper around FFmpeg / FFprobe."""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Executable resolution
# ---------------------------------------------------------------------------

def _find_executable(name: str) -> str:
    """Find the full path to *name*, searching PATH and common Windows locations."""
    path = shutil.which(name)
    if path:
        return path

    home = os.environ.get("USERPROFILE", "")
    search_dirs: list[str] = [
        os.path.join(home, "AppData", "Local", "Microsoft", "WinGet", "Links"),
        r"C:\ProgramData\chocolatey\bin",
        os.path.join(home, "scoop", "shims"),
    ]

    # Search WinGet packages (deep paths where the actual binary lives)
    winget_packages = os.path.join(
        home, "AppData", "Local", "Microsoft", "WinGet", "Packages",
    )
    if os.path.isdir(winget_packages):
        for pkg_dir in os.listdir(winget_packages):
            if "ffmpeg" in pkg_dir.lower():
                pkg_path = os.path.join(winget_packages, pkg_dir)
                for root, _dirs, files in os.walk(pkg_path):
                    if (name + ".exe") in files or name in files:
                        search_dirs.append(root)
                        break

    exe_name = name + ".exe" if os.name == "nt" else name
    for d in search_dirs:
        candidate = os.path.join(d, exe_name)
        if os.path.isfile(candidate):
            return candidate
        # Also check bare name (e.g. on non-Windows)
        bare = os.path.join(d, name)
        if bare != candidate and os.path.isfile(bare):
            return bare

    return name  # fall back to bare name; will fail with a clear error later


FFMPEG = _find_executable("ffmpeg")
FFPROBE = _find_executable("ffprobe")

log.info("FFmpeg resolved to: %s", FFMPEG)
log.info("FFprobe resolved to: %s", FFPROBE)


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _run_ffmpeg(args: list[str]) -> subprocess.CompletedProcess[str]:
    """Execute an FFmpeg/FFprobe command and return the completed process.

    Raises ``RuntimeError`` on non-zero exit codes or if the executable
    is not found.
    """
    # Replace bare executable names with resolved full paths
    if args and args[0] in ("ffmpeg", "ffmpeg.exe"):
        args = [FFMPEG, *args[1:]]
    elif args and args[0] in ("ffprobe", "ffprobe.exe"):
        args = [FFPROBE, *args[1:]]

    log.debug("Running: %s", " ".join(args))
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        # Re-resolve and retry once — the original path may have become
        # invalid (e.g. WinGet package updated).
        exe_name = Path(args[0]).stem
        fallback = _find_executable(exe_name)
        if fallback != args[0]:
            log.warning("Retrying with re-resolved path: %s", fallback)
            args = [fallback, *args[1:]]
            try:
                result = subprocess.run(args, capture_output=True, text=True)
            except FileNotFoundError:
                raise RuntimeError(
                    f"'{fallback}' not found. Please install FFmpeg and ensure it is on your PATH. "
                    f"Download from https://ffmpeg.org/download.html"
                ) from None
        else:
            raise RuntimeError(
                f"'{args[0]}' not found. Please install FFmpeg and ensure it is on your PATH. "
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
        FFPROBE,
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
        FFMPEG,
        "-i", file_path,
        "-af", f"silencedetect=noise={threshold_db}dB:d={min_duration}",
        "-f", "null",
        "-",
    ]
    log.debug("Running: %s", " ".join(args))
    try:
        result = subprocess.run(args, capture_output=True, text=True)
    except FileNotFoundError:
        raise RuntimeError(
            f"'{FFMPEG}' not found. Please install FFmpeg and ensure it is on your PATH. "
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
    """Extract the time range [*start*, *end*) from *input_path*.

    Always transcodes to PCM WAV to ensure compatibility regardless of
    the input codec.
    """
    duration = end - start
    _run_ffmpeg([
        "ffmpeg", "-y",
        "-ss", str(start),
        "-t", str(duration),
        "-i", input_path,
        "-acodec", "pcm_s16le",
        "-ar", "44100",
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
    """Concatenate multiple audio files.

    For small numbers of segments (≤ 20), uses the ``acrossfade`` filter for
    smooth transitions.  For larger counts, uses the concat demuxer with a
    list file to avoid exceeding the Windows command-line length limit.
    """
    if not segment_paths:
        raise ValueError("segment_paths must not be empty")

    if len(segment_paths) == 1:
        # Nothing to concatenate – just copy.
        _run_ffmpeg(["ffmpeg", "-y", "-i", segment_paths[0], "-c", "copy", output_path])
        return

    if len(segment_paths) > 20:
        # Use the concat demuxer with a list file (avoids command-line
        # length limits on Windows and FFmpeg filter graph complexity).
        _concat_via_listfile(segment_paths, output_path)
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


def _concat_via_listfile(segment_paths: list[str], output_path: str) -> None:
    """Concatenate segments using the FFmpeg concat demuxer (list file).

    This avoids Windows' ~32 767-char command-line limit and FFmpeg
    filter-graph complexity limits for very large segment counts.
    """
    import tempfile

    out_dir = os.path.dirname(output_path) or "."
    list_fd, list_path = tempfile.mkstemp(suffix=".txt", prefix="concat_", dir=out_dir)
    try:
        with os.fdopen(list_fd, "w", encoding="utf-8") as f:
            for p in segment_paths:
                safe = p.replace("\\", "/").replace("'", "'\\''")
                f.write(f"file '{safe}'\n")

        _run_ffmpeg([
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_path,
            "-c", "copy",
            output_path,
        ])
        log.info("Concatenated %d segments (list file) → %s", len(segment_paths), output_path)
    finally:
        try:
            os.remove(list_path)
        except OSError:
            pass


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
