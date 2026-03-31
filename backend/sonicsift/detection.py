"""Silence / speech segment detection and padding logic."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sonicsift.config import ProcessingConfig
from sonicsift.ffmpeg import detect_silence

log = logging.getLogger(__name__)


@dataclass
class Segment:
    """A contiguous region of audio classified as speech or silence."""

    start: float
    end: float
    duration: float
    segment_type: str  # "speech" or "silence"
    keep: bool


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_segments(
    file_path: str,
    config: ProcessingConfig,
) -> list[Segment]:
    """Detect speech and silence segments in *file_path*.

    Uses FFmpeg's ``silencedetect`` filter to locate silent regions, then
    inverts the result to derive speech regions.  Padding is applied to
    speech segments so that transient edges are not clipped.
    """
    from sonicsift.ffmpeg import get_ffprobe_info

    info = get_ffprobe_info(file_path)
    total_duration: float = info["duration"]

    silence_regions = detect_silence(
        file_path,
        threshold_db=config.silence_threshold_db,
        min_duration=config.min_silence_duration,
    )

    segments: list[Segment] = []
    cursor = 0.0

    for sil in silence_regions:
        sil_start: float = sil["start"]
        sil_end: float = sil["end"]

        # Speech region before this silence
        if sil_start > cursor:
            seg = Segment(
                start=cursor,
                end=sil_start,
                duration=sil_start - cursor,
                segment_type="speech",
                keep=True,
            )
            segments.append(seg)

        # Silence region
        segments.append(
            Segment(
                start=sil_start,
                end=sil_end,
                duration=sil_end - sil_start,
                segment_type="silence",
                keep=False,
            )
        )
        cursor = sil_end

    # Trailing speech after last silence
    if cursor < total_duration:
        segments.append(
            Segment(
                start=cursor,
                end=total_duration,
                duration=total_duration - cursor,
                segment_type="speech",
                keep=True,
            )
        )

    segments = apply_padding(segments, config.kept_padding_ms)
    log.info(
        "Detected %d segments (%d kept) in %s",
        len(segments),
        sum(1 for s in segments if s.keep),
        file_path,
    )
    return segments


def apply_padding(
    segments: list[Segment],
    padding_ms: int,
) -> list[Segment]:
    """Extend speech segments by *padding_ms* and merge overlapping ones.

    Silence segments that are fully consumed by expanded speech neighbours
    are dropped.  Adjacent speech segments whose padded ranges overlap are
    merged into a single segment.
    """
    if not segments:
        return []

    padding_s = padding_ms / 1000.0

    # --- Step 1: expand speech segments ---
    expanded: list[Segment] = []
    for seg in segments:
        if seg.segment_type == "speech":
            new_start = max(seg.start - padding_s, 0.0)
            new_end = seg.end + padding_s
            expanded.append(
                Segment(
                    start=new_start,
                    end=new_end,
                    duration=new_end - new_start,
                    segment_type="speech",
                    keep=True,
                )
            )
        else:
            expanded.append(seg)

    # --- Step 2: collect only the speech intervals and merge overlaps ---
    speech_intervals: list[Segment] = [s for s in expanded if s.segment_type == "speech"]

    merged_speech: list[Segment] = []
    for seg in speech_intervals:
        if merged_speech and seg.start <= merged_speech[-1].end:
            prev = merged_speech[-1]
            new_end = max(prev.end, seg.end)
            merged_speech[-1] = Segment(
                start=prev.start,
                end=new_end,
                duration=new_end - prev.start,
                segment_type="speech",
                keep=True,
            )
        else:
            merged_speech.append(seg)

    # --- Step 3: rebuild the timeline, interleaving silence gaps ---
    result: list[Segment] = []
    sil_segments = [s for s in expanded if s.segment_type == "silence"]

    if not merged_speech:
        # No speech at all — return the original silence segments unchanged.
        return sil_segments

    for speech in merged_speech:
        # Insert silence segments that fall before this speech segment
        for sil in sil_segments:
            if sil.end <= speech.start and (not result or sil.start >= result[-1].end):
                result.append(sil)
        result.append(speech)

    # Trailing silence after the last speech segment
    for sil in sil_segments:
        if result and sil.start >= result[-1].end:
            result.append(sil)

    return result
