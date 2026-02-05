"""
VAD Worker - Voice Activity Detection and audio chunking using Silero VAD
"""
from pathlib import Path
from typing import Optional
import uuid
import json

import torch
import torchaudio
import soundfile as sf

from ..config import DATASETS_DIR


class VADWorker:
    """Singleton Silero VAD model for audio chunking"""

    _instance: Optional["VADWorker"] = None
    _model = None
    _utils = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _load_model(self):
        """Lazy load Silero VAD model"""
        if self._model is None:
            print("Loading Silero VAD model...")
            torch.set_num_threads(1)

            self._model, self._utils = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                onnx=False,
                trust_repo=True,
            )
            print("Silero VAD model loaded")

        return self._model, self._utils

    def analyze(
        self,
        audio_path: str,
        range_start: float,
        range_end: float,
        vad_config: dict,
    ) -> dict:
        """
        Analyze audio with VAD and return chunk preview

        Args:
            audio_path: Path to audio file
            range_start: Start time in seconds
            range_end: End time in seconds
            vad_config: VAD configuration

        Returns:
            dict with chunks preview and statistics
        """
        model, utils = self._load_model()
        get_speech_timestamps = utils[0]

        # VAD config
        min_chunk_duration = vad_config.get("minChunkDuration", 6)
        target_chunk_duration = vad_config.get("targetChunkDuration", 10)
        max_chunk_duration = vad_config.get("maxChunkDuration", 15)
        min_silence_duration = vad_config.get("minSilenceDuration", 0.5)
        silence_threshold = vad_config.get("silenceThreshold", 0.5)

        # Load audio
        waveform, sample_rate = torchaudio.load(audio_path)

        # Convert to mono
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        # Trim to range
        start_sample = int(range_start * sample_rate)
        end_sample = int(range_end * sample_rate)
        waveform = waveform[:, start_sample:end_sample]

        # Resample to 16kHz for VAD
        if sample_rate != 16000:
            resampler = torchaudio.transforms.Resample(sample_rate, 16000)
            waveform_16k = resampler(waveform)
        else:
            waveform_16k = waveform

        # Get speech timestamps
        speech_timestamps = get_speech_timestamps(
            waveform_16k.squeeze(),
            model,
            threshold=silence_threshold,
            min_silence_duration_ms=int(min_silence_duration * 1000),
            sampling_rate=16000,
        )

        # Convert timestamps to original sample rate
        scale = sample_rate / 16000
        for ts in speech_timestamps:
            ts["start"] = int(ts["start"] * scale)
            ts["end"] = int(ts["end"] * scale)

        # Build chunks
        chunks = self._build_chunks(
            speech_timestamps,
            sample_rate,
            min_chunk_duration,
            target_chunk_duration,
            max_chunk_duration,
        )

        # Convert to time-based info
        chunk_infos = []
        for i, chunk in enumerate(chunks):
            start_time = chunk["start_sample"] / sample_rate + range_start
            end_time = chunk["end_sample"] / sample_rate + range_start
            duration = end_time - start_time

            chunk_infos.append({
                "id": f"chunk_{i}",
                "index": i,
                "start": start_time,
                "end": end_time,
                "duration": duration,
            })

        # Statistics
        durations = [c["duration"] for c in chunk_infos]
        if durations:
            avg_duration = sum(durations) / len(durations)
            min_dur = min(durations)
            max_dur = max(durations)
        else:
            avg_duration = min_dur = max_dur = 0

        return {
            "chunks": chunk_infos,
            "totalChunks": len(chunk_infos),
            "avgDuration": avg_duration,
            "minDuration": min_dur,
            "maxDuration": max_dur,
        }

    def _build_chunks(
        self,
        speech_timestamps: list,
        sample_rate: int,
        min_chunk_duration: float,
        target_chunk_duration: float,
        max_chunk_duration: float,
    ) -> list:
        """Build chunks from speech timestamps"""
        chunks = []
        current_chunk_start = None
        current_chunk_end = None

        for ts in speech_timestamps:
            seg_start = ts["start"]
            seg_end = ts["end"]

            if current_chunk_start is None:
                current_chunk_start = seg_start
                current_chunk_end = seg_end
                continue

            current_duration = (current_chunk_end - current_chunk_start) / sample_rate
            combined_duration = (seg_end - current_chunk_start) / sample_rate

            if combined_duration > max_chunk_duration:
                if current_duration >= min_chunk_duration:
                    chunks.append({
                        "start_sample": current_chunk_start,
                        "end_sample": current_chunk_end,
                    })
                elif chunks:
                    chunks[-1]["end_sample"] = current_chunk_end
                else:
                    chunks.append({
                        "start_sample": current_chunk_start,
                        "end_sample": current_chunk_end,
                    })

                current_chunk_start = seg_start
                current_chunk_end = seg_end
            elif current_duration >= target_chunk_duration:
                chunks.append({
                    "start_sample": current_chunk_start,
                    "end_sample": current_chunk_end,
                })
                current_chunk_start = seg_start
                current_chunk_end = seg_end
            else:
                current_chunk_end = seg_end

        # Add final chunk
        if current_chunk_start is not None:
            chunks.append({
                "start_sample": current_chunk_start,
                "end_sample": current_chunk_end,
            })

        return chunks

    def process(
        self,
        audio_path: str,
        range_start: float,
        range_end: float,
        vad_config: dict,
        auto_transcribe: bool = False,
        language: str = "ru",
        on_progress: callable = None,
    ) -> dict:
        """
        Process audio: chunk and optionally transcribe

        Returns:
            dict with datasetId and chunks
        """
        # Analyze first
        if on_progress:
            on_progress(5, "Analyzing audio with VAD...")

        preview = self.analyze(audio_path, range_start, range_end, vad_config)

        # Load audio
        waveform, sample_rate = torchaudio.load(audio_path)
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        # Trim to range
        start_sample = int(range_start * sample_rate)
        end_sample = int(range_end * sample_rate)
        waveform = waveform[:, start_sample:end_sample]

        # Resample to 22050Hz for XTTS
        if sample_rate != 22050:
            resampler = torchaudio.transforms.Resample(sample_rate, 22050)
            waveform_output = resampler(waveform)
            output_sr = 22050
        else:
            waveform_output = waveform
            output_sr = sample_rate

        # Create dataset
        dataset_id = f"chunks_{uuid.uuid4().hex[:8]}"
        dataset_path = DATASETS_DIR / dataset_id
        dataset_path.mkdir(parents=True, exist_ok=True)

        if on_progress:
            on_progress(20, "Splitting audio into chunks...")

        # Re-analyze with sample info
        model, utils = self._load_model()
        get_speech_timestamps = utils[0]

        min_chunk_duration = vad_config.get("minChunkDuration", 6)
        target_chunk_duration = vad_config.get("targetChunkDuration", 10)
        max_chunk_duration = vad_config.get("maxChunkDuration", 15)
        min_silence_duration = vad_config.get("minSilenceDuration", 0.5)
        silence_threshold = vad_config.get("silenceThreshold", 0.5)

        # Get timestamps at 16kHz
        if sample_rate != 16000:
            resampler_16k = torchaudio.transforms.Resample(sample_rate, 16000)
            waveform_16k = resampler_16k(waveform)
        else:
            waveform_16k = waveform

        speech_timestamps = get_speech_timestamps(
            waveform_16k.squeeze(),
            model,
            threshold=silence_threshold,
            min_silence_duration_ms=int(min_silence_duration * 1000),
            sampling_rate=16000,
        )

        # Scale to original rate
        scale = sample_rate / 16000
        for ts in speech_timestamps:
            ts["start"] = int(ts["start"] * scale)
            ts["end"] = int(ts["end"] * scale)

        chunks = self._build_chunks(
            speech_timestamps,
            sample_rate,
            min_chunk_duration,
            target_chunk_duration,
            max_chunk_duration,
        )

        # Output scale
        output_scale = output_sr / sample_rate

        result_chunks = []
        total_chunks = len(chunks)

        for i, chunk in enumerate(chunks):
            if on_progress:
                progress = 20 + int((60 * (i + 1)) / total_chunks)
                on_progress(progress, f"Processing chunk {i + 1}/{total_chunks}...")

            chunk_filename = f"chunk_{str(i + 1).zfill(3)}.wav"
            chunk_path = dataset_path / chunk_filename

            # Extract chunk
            start_out = int(chunk["start_sample"] * output_scale)
            end_out = int(chunk["end_sample"] * output_scale)
            chunk_audio = waveform_output[:, start_out:end_out]

            # Save
            sf.write(
                str(chunk_path),
                chunk_audio.squeeze().numpy(),
                output_sr,
                subtype="PCM_16",
            )

            duration = (chunk["end_sample"] - chunk["start_sample"]) / sample_rate
            result_chunks.append({
                "filename": chunk_filename,
                "duration": duration,
            })

        # Transcribe if needed
        if auto_transcribe:
            if on_progress:
                on_progress(85, "Transcribing chunks with Whisper...")

            from .whisper import whisper_worker

            for chunk_result in result_chunks:
                chunk_path = dataset_path / chunk_result["filename"]
                try:
                    result = whisper_worker.transcribe(str(chunk_path), language)
                    transcription = " ".join([seg["text"] for seg in result["segments"]])
                    chunk_result["transcription"] = transcription
                except Exception as e:
                    chunk_result["transcription"] = f"[Error: {str(e)}]"

            # Save metadata
            metadata = {
                "language": language,
                "chunks": result_chunks,
            }
            with open(dataset_path / "metadata.json", "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)

        if on_progress:
            on_progress(100, "Chunking complete")

        return {
            "datasetId": dataset_id,
            "chunks": result_chunks,
        }


# Global instance
vad_worker = VADWorker()
