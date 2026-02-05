"""
Whisper Worker - Audio transcription using faster-whisper
"""
from pathlib import Path
from typing import Optional
import json

from ..config import WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE, DATASETS_DIR


class WhisperWorker:
    """Singleton Whisper model for transcription"""

    _instance: Optional["WhisperWorker"] = None
    _model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _load_model(self):
        """Lazy load Whisper model"""
        if self._model is None:
            from faster_whisper import WhisperModel
            print(f"Loading Whisper model: {WHISPER_MODEL}")
            self._model = WhisperModel(
                WHISPER_MODEL,
                device=WHISPER_DEVICE,
                compute_type=WHISPER_COMPUTE_TYPE,
            )
            print("Whisper model loaded")
        return self._model

    def transcribe(
        self,
        audio_path: str,
        language: str = "ru",
    ) -> dict:
        """
        Transcribe audio file

        Returns:
            dict with segments and language info
        """
        model = self._load_model()

        segments, info = model.transcribe(
            audio_path,
            language=language,
            beam_size=5,
            vad_filter=True,
        )

        result_segments = []
        for segment in segments:
            result_segments.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
            })

        return {
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "segments": result_segments,
        }

    def process_files(
        self,
        files: list[dict],
        language: str = "ru",
        on_progress: callable = None,
    ) -> dict:
        """
        Process multiple audio files

        Args:
            files: List of {"id": str, "path": str, "filename": str}
            language: Target language
            on_progress: Callback(progress: int, message: str)

        Returns:
            dict with dataset_id and results
        """
        results = []
        total = len(files)

        for i, file_info in enumerate(files):
            if on_progress:
                progress = int((i / total) * 100)
                on_progress(progress, f"Processing {file_info['filename']}...")

            try:
                transcription = self.transcribe(file_info["path"], language)
                results.append({
                    "audio_id": file_info["id"],
                    "filename": file_info["filename"],
                    "language": transcription["language"],
                    "segments": transcription["segments"],
                })
            except Exception as e:
                results.append({
                    "audio_id": file_info["id"],
                    "filename": file_info["filename"],
                    "error": str(e),
                })

        # Save dataset
        if results:
            dataset_id = files[0]["id"][:8]
            dataset_path = DATASETS_DIR / dataset_id
            dataset_path.mkdir(parents=True, exist_ok=True)

            with open(dataset_path / "metadata.json", "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)

            if on_progress:
                on_progress(100, "Processing complete")

            return {
                "dataset_id": dataset_id,
                "files_processed": len(results),
                "results": results,
            }

        return {"error": "No files processed"}


# Global instance
whisper_worker = WhisperWorker()
