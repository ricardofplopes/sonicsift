"""Chunk planning for large audio files."""

from __future__ import annotations

# Overlap between consecutive chunks (seconds).  A small overlap avoids
# cutting speech that spans a chunk boundary.
_OVERLAP_S = 2.0


def plan_chunks(
    duration_s: float,
    chunk_duration_s: int = 300,
) -> list[dict]:
    """Split *duration_s* seconds of audio into overlapping chunks.

    Each returned dict contains:

    * ``index`` – zero-based chunk index
    * ``start`` – start time in seconds
    * ``end``   – end time in seconds

    Consecutive chunks overlap by a fixed amount (currently 2 s) so that
    silence/speech boundaries near the edges are not missed.
    """
    if duration_s <= 0:
        raise ValueError("duration_s must be positive")
    if chunk_duration_s <= 0:
        raise ValueError("chunk_duration_s must be positive")

    chunks: list[dict] = []
    step = max(chunk_duration_s - _OVERLAP_S, 1.0)
    start = 0.0
    index = 0

    while start < duration_s:
        end = min(start + chunk_duration_s, duration_s)
        chunks.append({"index": index, "start": start, "end": end})
        index += 1
        start += step

        # Avoid a tiny trailing chunk shorter than the overlap.
        if duration_s - start < _OVERLAP_S:
            break

    return chunks
