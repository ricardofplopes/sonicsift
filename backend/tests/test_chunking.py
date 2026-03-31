"""Unit tests for the chunking module."""

from __future__ import annotations

import pytest

from sonicsift.chunking import plan_chunks


class TestPlanChunks:
    """Tests for :func:`plan_chunks`."""

    def test_correct_number_of_chunks(self) -> None:
        """A 600 s file with 300 s chunks should yield at least 2 chunks."""
        chunks = plan_chunks(600.0, chunk_duration_s=300)
        # Expect exactly 2 chunks (step = 300 - 2 = 298, starts at 0 and 298).
        assert len(chunks) >= 2

    def test_chunks_cover_full_duration(self) -> None:
        """The last chunk must reach the end of the file."""
        duration = 600.0
        chunks = plan_chunks(duration, chunk_duration_s=300)
        assert chunks[-1]["end"] == pytest.approx(duration)

    def test_overlap_between_consecutive_chunks(self) -> None:
        """Consecutive chunks must overlap by at least 1 second."""
        chunks = plan_chunks(900.0, chunk_duration_s=300)
        for a, b in zip(chunks, chunks[1:]):
            overlap = a["end"] - b["start"]
            assert overlap >= 1.0, f"Chunks {a['index']} and {b['index']} overlap only {overlap}s"

    def test_single_chunk_for_short_file(self) -> None:
        """A file shorter than chunk_duration_s should produce exactly one chunk."""
        chunks = plan_chunks(120.0, chunk_duration_s=300)
        assert len(chunks) == 1
        assert chunks[0]["start"] == 0.0
        assert chunks[0]["end"] == 120.0

    def test_chunk_indices_are_sequential(self) -> None:
        chunks = plan_chunks(1200.0, chunk_duration_s=300)
        for i, chunk in enumerate(chunks):
            assert chunk["index"] == i

    def test_invalid_duration_raises(self) -> None:
        with pytest.raises(ValueError, match="positive"):
            plan_chunks(0)

    def test_invalid_chunk_duration_raises(self) -> None:
        with pytest.raises(ValueError, match="positive"):
            plan_chunks(300, chunk_duration_s=0)
