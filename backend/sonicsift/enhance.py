"""Speech enhancement pipelines."""

from __future__ import annotations

import abc
import logging
import os

from sonicsift.ffmpeg import apply_highpass, encode_output, normalize_audio

log = logging.getLogger(__name__)


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


class NoisereducePipeline(EnhancementPipeline):
    """Enhancement pipeline using noisereduce for spectral gating noise reduction."""

    def process(
        self,
        input_path: str,
        output_path: str,
        strength: float,
    ) -> None:
        """Apply noisereduce spectral gating then FFmpeg normalization."""
        import numpy as np
        import noisereduce as nr
        from scipy.io import wavfile

        log.info("NoisereducePipeline: processing %s (strength=%.2f)", input_path, strength)

        # Convert to WAV if needed (noisereduce works with numpy arrays)
        wav_input = input_path
        temp_wav: str | None = None
        if not input_path.lower().endswith(".wav"):
            temp_wav = output_path + ".nr_temp.wav"
            encode_output(input_path, temp_wav, "wav")
            wav_input = temp_wav

        try:
            sample_rate, data = wavfile.read(wav_input)

            # Convert to float32
            if data.dtype == np.int16:
                data = data.astype(np.float32) / 32768.0
            elif data.dtype == np.int32:
                data = data.astype(np.float32) / 2147483648.0
            elif data.dtype != np.float32:
                data = data.astype(np.float32)

            # prop_decrease controls how much noise is reduced (0=none, 1=full)
            prop_decrease = 0.5 + strength * 0.4  # 0.5 to 0.9

            if data.ndim == 1:
                reduced = nr.reduce_noise(
                    y=data,
                    sr=sample_rate,
                    prop_decrease=prop_decrease,
                    stationary=True,
                )
            else:
                channels = []
                for ch in range(data.shape[1]):
                    reduced_ch = nr.reduce_noise(
                        y=data[:, ch],
                        sr=sample_rate,
                        prop_decrease=prop_decrease,
                        stationary=True,
                    )
                    channels.append(reduced_ch)
                reduced = np.column_stack(channels)

            reduced = np.clip(reduced, -1.0, 1.0)
            reduced_int16 = (reduced * 32767).astype(np.int16)

            nr_output = output_path + ".nr_intermediate.wav"
            wavfile.write(nr_output, sample_rate, reduced_int16)

            # Apply FFmpeg normalization on top
            normalize_audio(nr_output, output_path)

            if os.path.exists(nr_output):
                os.remove(nr_output)
        finally:
            if temp_wav and os.path.exists(temp_wav):
                os.remove(temp_wav)

        log.info("NoisereducePipeline: done → %s", output_path)


_PIPELINES: dict[str, type[EnhancementPipeline]] = {
    "default": DefaultEnhancementPipeline,
    "noisereduce": NoisereducePipeline,
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
