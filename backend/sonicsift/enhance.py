"""Speech enhancement pipelines."""

from __future__ import annotations

import abc
import logging

from sonicsift.ffmpeg import apply_highpass, normalize_audio

log = logging.getLogger(__name__)

# TODO: Add noisereduce and demucs-based pipelines for more advanced
#       speech enhancement in a future iteration.


class EnhancementPipeline(abc.ABC):
    """Base class for audio enhancement strategies."""

    @abc.abstractmethod
    def process(
        self,
        input_path: str,
        output_path: str,
        strength: float,
    ) -> None:
        """Enhance *input_path* and write the result to *output_path*.

        *strength* is a 0.0–1.0 value controlling how aggressively the
        pipeline modifies the audio.
        """


class DefaultEnhancementPipeline(EnhancementPipeline):
    """FFmpeg-only enhancement: loudness normalisation ± highpass filter.

    * ``strength < 0.3`` → normalisation only
    * ``strength >= 0.3`` → normalisation **+** highpass (80 Hz)
    """

    def process(
        self,
        input_path: str,
        output_path: str,
        strength: float,
    ) -> None:
        if strength < 0.3:
            log.info("Enhancing (normalize only, strength=%.2f): %s", strength, input_path)
            normalize_audio(input_path, output_path)
        else:
            log.info("Enhancing (normalize + highpass, strength=%.2f): %s", strength, input_path)
            # Two-pass: normalize first, then highpass.
            import tempfile
            import os

            work_dir = os.path.dirname(output_path) or "."
            intermediate = os.path.join(work_dir, "_enhance_intermediate.wav")
            try:
                normalize_audio(input_path, intermediate)
                apply_highpass(intermediate, output_path)
            finally:
                if os.path.exists(intermediate):
                    os.remove(intermediate)


_PIPELINES: dict[str, type[EnhancementPipeline]] = {
    "default": DefaultEnhancementPipeline,
}


def get_pipeline(name: str = "default") -> EnhancementPipeline:
    """Return an enhancement pipeline instance by *name*.

    Raises ``ValueError`` for unknown pipeline names.
    """
    cls = _PIPELINES.get(name)
    if cls is None:
        raise ValueError(
            f"Unknown enhancement pipeline {name!r}. "
            f"Available: {', '.join(_PIPELINES)}"
        )
    return cls()
