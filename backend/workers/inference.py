"""
Inference Worker - TTS generation using XTTS v2
"""
from pathlib import Path
from typing import Optional
import uuid
import numpy as np
import scipy.io.wavfile as wavfile

from ..config import XTTS_MODEL, OUTPUT_DIR, SPEAKERS_DIR, CACHE_DIR


class InferenceWorker:
    """Singleton XTTS model for speech synthesis"""

    _instance: Optional["InferenceWorker"] = None
    _tts = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _load_model(self):
        """Lazy load XTTS model"""
        if self._tts is None:
            import torch

            # Patch torch.load for compatibility
            _original_torch_load = torch.load
            def _patched_torch_load(*args, **kwargs):
                kwargs.setdefault('weights_only', False)
                return _original_torch_load(*args, **kwargs)
            torch.load = _patched_torch_load

            from TTS.api import TTS

            print(f"Loading XTTS model: {XTTS_MODEL}")
            self._tts = TTS(XTTS_MODEL, gpu=True)
            print("XTTS model loaded")

        return self._tts

    def _get_default_speaker(self) -> str:
        """Get or create default speaker WAV"""
        default_speaker = CACHE_DIR / "default_speaker.wav"

        if not default_speaker.exists():
            # Generate simple reference audio
            sample_rate = 22050
            duration = 3.0
            freq = 200
            t = np.linspace(0, duration, int(sample_rate * duration), False)
            wave = 0.3 * np.sin(2 * np.pi * freq * t)
            wave += 0.1 * np.sin(2 * np.pi * freq * 2 * t)
            wave_int16 = (wave * 32767).astype(np.int16)
            wavfile.write(str(default_speaker), sample_rate, wave_int16)

        return str(default_speaker)

    def generate(
        self,
        text: str,
        speaker_wav: str = None,
        language: str = "ru",
        temperature: float = 0.7,
        speed: float = 1.0,
        top_k: int = 50,
        top_p: float = 0.85,
    ) -> dict:
        """
        Generate speech from text

        Args:
            text: Text to synthesize
            speaker_wav: Path to speaker reference audio
            language: Target language
            temperature: Generation temperature
            speed: Speech speed multiplier
            top_k: Top-k sampling
            top_p: Top-p sampling

        Returns:
            dict with audio_url, duration, id
        """
        tts = self._load_model()

        # Get speaker wav
        if not speaker_wav or not Path(speaker_wav).exists():
            # Try to find in speakers directory
            if speaker_wav:
                speaker_path = SPEAKERS_DIR / speaker_wav
                if speaker_path.exists():
                    speaker_wav = str(speaker_path)
                else:
                    speaker_wav = self._get_default_speaker()
            else:
                speaker_wav = self._get_default_speaker()

        # Generate audio
        wav = tts.tts(
            text=text,
            speaker_wav=speaker_wav,
            language=language,
        )

        # Save output
        output_id = str(uuid.uuid4())
        output_path = OUTPUT_DIR / f"{output_id}.wav"

        wav_array = np.array(wav)
        wav_int16 = (wav_array * 32767).astype(np.int16)
        wavfile.write(str(output_path), 24000, wav_int16)

        duration = len(wav) / 24000

        return {
            "id": output_id,
            "audio_url": f"/api/inference/audio/{output_id}.wav",
            "duration": duration,
        }

    def list_speakers(self) -> list[dict]:
        """List available speaker WAV files"""
        speakers = []

        if SPEAKERS_DIR.exists():
            for wav_file in SPEAKERS_DIR.glob("*.wav"):
                speakers.append({
                    "name": wav_file.stem,
                    "path": str(wav_file),
                })

        return speakers


# Global instance
inference_worker = InferenceWorker()
