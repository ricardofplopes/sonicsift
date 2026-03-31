"""Final encoding / export of the assembled audio."""

from __future__ import annotations

import logging
import os

from sonicsift.ffmpeg import encode_output

log = logging.getLogger(__name__)


def export_final(
    assembled_path: str,
    output_path: str,
    fmt: str = "wav",
) -> str:
    """Encode the assembled audio to the target format.

    Parameters:
        assembled_path: Path to the assembled intermediate WAV.
        output_path:    Desired output file path.
        fmt:            Target format (``wav``, ``mp3``, or ``flac``).

    Returns:
        Absolute path to the final encoded file.
    """
    if not os.path.isfile(assembled_path):
        raise FileNotFoundError(f"Assembled file not found: {assembled_path}")

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    log.info("Exporting %s → %s (format=%s)", assembled_path, output_path, fmt)
    encode_output(assembled_path, output_path, fmt)

    return os.path.abspath(output_path)
