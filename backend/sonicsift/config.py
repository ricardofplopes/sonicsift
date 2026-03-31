"""Processing configuration backed by pydantic-settings."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class ProcessingConfig(BaseSettings):
    """Runtime-tunable knobs for the audio processing pipeline.

    Values can be overridden via environment variables prefixed with
    ``SONICSIFT_`` (e.g. ``SONICSIFT_SILENCE_THRESHOLD_DB=-40``).
    """

    model_config = {"env_prefix": "SONICSIFT_"}

    silence_threshold_db: float = -35.0
    """dB level below which audio is considered silence."""

    min_silence_duration: float = 1.0
    """Minimum seconds of continuous silence to trigger a cut."""

    kept_padding_ms: int = 200
    """Milliseconds of padding to keep around speech segments."""

    enhancement_strength: float = 0.5
    """0.0–1.0, controls enhancement aggressiveness."""

    output_format: str = "wav"
    """Target output format (wav, mp3, or flac)."""

    chunk_duration_s: int = 300
    """Duration in seconds of each processing chunk (default 5 min)."""

    crossfade_ms: int = 50
    """Crossfade duration in ms when joining segments."""

    work_dir: str = ".sonicsift-work"
    """Temporary working directory for intermediate files."""
