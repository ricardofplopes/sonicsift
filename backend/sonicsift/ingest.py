"""File ingestion: validation and metadata extraction."""

from __future__ import annotations

import logging
from pathlib import Path

from sonicsift.ffmpeg import get_ffprobe_info

log = logging.getLogger(__name__)


class IngestError(Exception):
    """Raised when a file cannot be ingested."""


def validate_file(file_path: str) -> dict:
    """Validate that *file_path* exists, is readable, and contains audio.

    Returns the metadata dict produced by :func:`ffmpeg.get_ffprobe_info`.

    Raises:
        IngestError: If the file is missing, unreadable, or has no audio stream.
    """
    p = Path(file_path)

    if not p.exists():
        raise IngestError(f"File not found: {file_path}")

    if not p.is_file():
        raise IngestError(f"Path is not a regular file: {file_path}")

    if not p.stat().st_size:
        raise IngestError(f"File is empty: {file_path}")

    try:
        metadata = get_ffprobe_info(file_path)
    except RuntimeError as exc:
        raise IngestError(f"Cannot read audio metadata: {exc}") from exc

    if metadata.get("duration", 0) <= 0:
        raise IngestError(f"File has zero or negative duration: {file_path}")

    log.info(
        "Validated %s – %.1fs, %d Hz, %d ch, codec=%s",
        file_path,
        metadata["duration"],
        metadata["sample_rate"],
        metadata["channels"],
        metadata["codec"],
    )
    return metadata
