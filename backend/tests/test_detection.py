"""Unit tests for the detection module."""

from __future__ import annotations

from sonicsift.detection import Segment, apply_padding


class TestSegmentDataclass:
    """Basic sanity checks for the :class:`Segment` dataclass."""

    def test_create_speech_segment(self) -> None:
        seg = Segment(start=0.0, end=5.0, duration=5.0, segment_type="speech", keep=True)
        assert seg.segment_type == "speech"
        assert seg.keep is True
        assert seg.duration == 5.0

    def test_create_silence_segment(self) -> None:
        seg = Segment(start=5.0, end=8.0, duration=3.0, segment_type="silence", keep=False)
        assert seg.segment_type == "silence"
        assert seg.keep is False


class TestApplyPadding:
    """Tests for :func:`apply_padding`."""

    def test_empty_segments(self) -> None:
        assert apply_padding([], padding_ms=200) == []

    def test_padding_extends_speech(self) -> None:
        """Speech segments should grow by padding_ms on each side."""
        segments = [
            Segment(start=2.0, end=4.0, duration=2.0, segment_type="speech", keep=True),
        ]
        result = apply_padding(segments, padding_ms=500, total_duration=6.0)
        speech = [s for s in result if s.segment_type == "speech"]
        assert len(speech) == 1
        assert speech[0].start == 1.5  # 2.0 - 0.5
        assert speech[0].end == 4.5    # 4.0 + 0.5
        # Should also have leading and trailing silence
        assert result[0].segment_type == "silence"
        assert result[0].end == 1.5
        assert result[-1].segment_type == "silence"
        assert result[-1].start == 4.5

    def test_padding_does_not_go_negative(self) -> None:
        segments = [
            Segment(start=0.1, end=1.0, duration=0.9, segment_type="speech", keep=True),
        ]
        result = apply_padding(segments, padding_ms=500, total_duration=2.0)
        speech = [s for s in result if s.segment_type == "speech"]
        assert speech[0].start == 0.0

    def test_overlapping_speech_segments_are_merged(self) -> None:
        segments = [
            Segment(start=1.0, end=3.0, duration=2.0, segment_type="speech", keep=True),
            Segment(start=3.0, end=3.5, duration=0.5, segment_type="silence", keep=False),
            Segment(start=3.5, end=5.0, duration=1.5, segment_type="speech", keep=True),
        ]
        # With 500 ms padding the first speech expands to [0.5, 3.5] and the
        # second to [3.0, 5.5] — they overlap and should merge.
        result = apply_padding(segments, padding_ms=500, total_duration=6.0)
        speech_segments = [s for s in result if s.segment_type == "speech"]
        assert len(speech_segments) == 1
        assert speech_segments[0].start == 0.5
        assert speech_segments[0].end == 5.5

    def test_silence_not_padded(self) -> None:
        """Silence segments should not be expanded by padding."""
        segments = [
            Segment(start=0.0, end=2.0, duration=2.0, segment_type="silence", keep=False),
        ]
        result = apply_padding(segments, padding_ms=200, total_duration=2.0)
        assert result[0].start == 0.0
        assert result[0].end == 2.0
