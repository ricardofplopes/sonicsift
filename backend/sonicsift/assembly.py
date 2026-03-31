"""Segment assembly: concatenate enhanced speech segments."""

from __future__ import annotations

import logging
import os

from sonicsift.ffmpeg import concat_segments

log = logging.getLogger(__name__)


def assemble_segments(
    kept_segments: list[dict],
    work_dir: str,
    crossfade_ms: int = 50,
) -> str:
    """Concatenate enhanced segments into a single audio file.

    Parameters:
        kept_segments:
            Each dict must contain a ``"path"`` key pointing to an enhanced
            audio file on disk.
        work_dir:
            Directory where the assembled output file is written.
        crossfade_ms:
            Crossfade duration between consecutive segments in milliseconds.

    Returns:
        Absolute path to the assembled WAV file.
    """
    paths = [seg["path"] for seg in kept_segments]

    if not paths:
        raise ValueError("No segments to assemble")

    for p in paths:
        if not os.path.isfile(p):
            raise FileNotFoundError(f"Segment file missing: {p}")

    os.makedirs(work_dir, exist_ok=True)
    output_path = os.path.join(work_dir, "assembled.wav")

    log.info("Assembling %d segments → %s (crossfade=%d ms)", len(paths), output_path, crossfade_ms)
    concat_segments(paths, output_path, crossfade_ms=crossfade_ms)

    return os.path.abspath(output_path)
