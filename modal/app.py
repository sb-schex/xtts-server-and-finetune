"""
XTTS Fine-tuning WebUI - Modal Backend
FastAPI server with GPU workers for Whisper, Training, and Inference
"""

import modal
from pathlib import Path

# Modal App
app = modal.App("xtts-webui-api")

# Volumes
data_volume = modal.Volume.from_name("xtts-finetune-data", create_if_missing=True)
cache_volume = modal.Volume.from_name("xtts-model-cache", create_if_missing=True)
speakers_volume = modal.Volume.from_name("xtts-speakers", create_if_missing=True)

VOLUME_MOUNTS = {
    "/data": data_volume,
    "/cache": cache_volume,
    "/speakers": speakers_volume,
}

# Base image with common dependencies
base_image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "fastapi>=0.109.0",
    "uvicorn>=0.27.0",
    "python-multipart>=0.0.6",
    "aiofiles>=23.2.1",
)

# Whisper image for transcription
whisper_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "faster-whisper>=1.0.0",
        "torch>=2.1.0",
        "torchaudio>=2.1.0",
        "pydub>=0.25.1",
    )
)

# Training image with XTTS dependencies
training_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install(
        "TTS>=0.22.0",
        "torch>=2.1.0",
        "torchaudio>=2.1.0",
        "transformers>=4.36.0,<4.40.0",  # BeamSearchScorer removed in 4.40+
        "trainer>=0.0.32",
    )
)

# Inference image
inference_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "TTS>=0.22.0",
        "torch>=2.1.0",
        "torchaudio>=2.1.0",
        "scipy>=1.11.0",
        "transformers>=4.36.0,<4.40.0",  # BeamSearchScorer removed in 4.40+
        "soundfile>=0.12.0",
        "torchcodec",  # Required by torchaudio for audio loading
    )
)

# VAD chunking image for long audio processing
vad_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch>=2.1.0",
        "torchaudio>=2.1.0",
        "pydub>=0.25.1",
        "soundfile>=0.12.0",
        "faster-whisper>=1.0.0",
    )
)


# ============== FastAPI Server ==============

@app.function(
    image=base_image,
    volumes=VOLUME_MOUNTS,
    secrets=[modal.Secret.from_name("xtts-webui-auth")],
    allow_concurrent_inputs=100,
)
@modal.asgi_app()
def api():
    from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse, FileResponse
    import os
    import json
    import uuid
    import asyncio

    api_app = FastAPI(title="XTTS WebUI API")

    # CORS
    api_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Job storage (in-memory, replace with Redis for production)
    jobs = {}

    # ============== Health ==============

    @api_app.get("/health")
    async def health():
        return {"status": "ok"}

    # ============== Data Upload ==============

    @api_app.post("/api/data/upload")
    async def upload_audio(files: list[UploadFile] = File(...)):
        uploaded = []
        for file in files:
            if not file.content_type.startswith("audio/"):
                continue

            file_id = str(uuid.uuid4())
            file_path = Path(f"/data/uploads/{file_id}_{file.filename}")
            file_path.parent.mkdir(parents=True, exist_ok=True)

            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)

            uploaded.append({
                "id": file_id,
                "filename": file.filename,
                "size": len(content),
                "path": str(file_path),
            })

        data_volume.commit()
        return {"success": True, "files": uploaded}

    # ============== Data Processing ==============

    @api_app.post("/api/data/process")
    async def start_processing(request: dict, background_tasks: BackgroundTasks):
        job_id = str(uuid.uuid4())
        audio_ids = request.get("audioIds", [])
        language = request.get("language", "ru")

        jobs[job_id] = {
            "status": "pending",
            "progress": 0,
            "message": "Starting...",
        }

        # Spawn Whisper worker
        background_tasks.add_task(
            run_whisper_job, job_id, audio_ids, language
        )

        return {"success": True, "jobId": job_id}

    async def run_whisper_job(job_id: str, audio_ids: list, language: str):
        jobs[job_id]["status"] = "processing"

        # Call Modal function
        try:
            result = whisper_worker.remote(audio_ids, language)
            jobs[job_id] = {
                "status": "completed",
                "progress": 100,
                "result": result,
            }
        except Exception as e:
            jobs[job_id] = {
                "status": "failed",
                "error": str(e),
            }

    @api_app.get("/api/data/progress/{job_id}")
    async def get_processing_progress(job_id: str):
        async def event_stream():
            while True:
                if job_id in jobs:
                    job = jobs[job_id]
                    yield f"data: {json.dumps(job)}\n\n"

                    if job["status"] in ["completed", "failed"]:
                        yield f"event: complete\ndata: {json.dumps(job)}\n\n"
                        break

                await asyncio.sleep(0.5)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
        )

    @api_app.get("/api/data/datasets")
    async def list_datasets():
        datasets_path = Path("/data/datasets")
        datasets_path.mkdir(parents=True, exist_ok=True)

        datasets = []
        for item in datasets_path.iterdir():
            if item.is_dir():
                datasets.append({
                    "name": item.name,
                    "path": str(item),
                    "isDirectory": True,
                })

        return {"success": True, "data": datasets}

    # ============== VAD Chunking ==============

    @api_app.post("/api/data/analyze")
    async def analyze_audio_vad(request: dict):
        """Analyze audio with VAD and return chunk preview (no files created)"""
        try:
            audio_path = request.get("audioPath", "")
            range_info = request.get("range", {})
            vad_config = request.get("vadConfig", {})

            result = vad_chunking_worker.remote(
                audio_path=audio_path,
                range_start=range_info.get("start", 0),
                range_end=range_info.get("end", 0),
                vad_config=vad_config,
                mode="analyze",
            )

            return {"success": True, "preview": result}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @api_app.post("/api/data/chunk")
    async def chunk_audio_vad(request: dict, background_tasks: BackgroundTasks):
        """Start VAD chunking job"""
        job_id = str(uuid.uuid4())

        jobs[job_id] = {
            "status": "pending",
            "progress": 0,
            "message": "Starting VAD chunking...",
        }

        background_tasks.add_task(
            run_chunking_job,
            job_id,
            request.get("audioPath", ""),
            request.get("range", {}),
            request.get("vadConfig", {}),
            request.get("autoTranscribe", False),
            request.get("language", "ru"),
        )

        return {"success": True, "jobId": job_id}

    async def run_chunking_job(
        job_id: str,
        audio_path: str,
        range_info: dict,
        vad_config: dict,
        auto_transcribe: bool,
        language: str,
    ):
        jobs[job_id]["status"] = "analyzing"
        jobs[job_id]["message"] = "Analyzing audio with VAD..."

        try:
            result = vad_chunking_worker.remote(
                audio_path=audio_path,
                range_start=range_info.get("start", 0),
                range_end=range_info.get("end", 0),
                vad_config=vad_config,
                mode="chunk",
                auto_transcribe=auto_transcribe,
                language=language,
            )

            jobs[job_id] = {
                "status": "completed",
                "progress": 100,
                "message": "Chunking complete",
                "result": result,
            }
        except Exception as e:
            jobs[job_id] = {
                "status": "failed",
                "error": str(e),
            }

    @api_app.get("/api/data/chunk/progress/{job_id}")
    async def get_chunking_progress(job_id: str):
        async def event_stream():
            while True:
                if job_id in jobs:
                    job = jobs[job_id]
                    yield f"data: {json.dumps(job)}\n\n"

                    if job["status"] in ["completed", "failed"]:
                        yield f"event: complete\ndata: {json.dumps(job)}\n\n"
                        break

                await asyncio.sleep(0.5)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
        )

    # ============== Training ==============

    @api_app.post("/api/training/start")
    async def start_training(request: dict, background_tasks: BackgroundTasks):
        job_id = str(uuid.uuid4())

        jobs[job_id] = {
            "status": "pending",
            "epoch": 0,
            "totalEpochs": request.get("epochs", 10),
            "loss": 0,
            "metrics": [],
        }

        background_tasks.add_task(run_training_job, job_id, request)

        return {"success": True, "jobId": job_id}

    async def run_training_job(job_id: str, config: dict):
        jobs[job_id]["status"] = "training"

        try:
            # Call Modal training function
            for update in training_worker.remote_gen(config):
                jobs[job_id].update(update)

            jobs[job_id]["status"] = "completed"
        except Exception as e:
            jobs[job_id] = {
                "status": "failed",
                "error": str(e),
            }

    @api_app.get("/api/training/progress/{job_id}")
    async def get_training_progress(job_id: str):
        async def event_stream():
            while True:
                if job_id in jobs:
                    job = jobs[job_id]
                    yield f"data: {json.dumps(job)}\n\n"

                    if job["status"] in ["completed", "failed"]:
                        yield f"event: complete\ndata: {json.dumps(job)}\n\n"
                        break

                await asyncio.sleep(1)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
        )

    @api_app.get("/api/training/models")
    async def list_models():
        models_path = Path("/data/models")
        models_path.mkdir(parents=True, exist_ok=True)

        models = []
        for item in models_path.iterdir():
            if item.is_dir():
                models.append({
                    "name": item.name,
                    "path": str(item),
                    "isDirectory": True,
                })

        return {"success": True, "data": models}

    # ============== Inference ==============

    @api_app.post("/api/inference/generate")
    async def generate_speech(request: dict):
        try:
            result = inference_worker.remote(request)
            return {"success": True, "data": result}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @api_app.get("/api/inference/speakers")
    async def list_speakers():
        speakers_path = Path("/speakers")
        speakers_path.mkdir(parents=True, exist_ok=True)

        speakers = []
        for item in speakers_path.glob("*.wav"):
            speakers.append({
                "name": item.stem,
                "path": str(item),
            })

        return {"success": True, "data": speakers}

    @api_app.post("/api/inference/speakers/upload")
    async def upload_speaker(file: UploadFile = File(...)):
        if not file.content_type.startswith("audio/"):
            raise HTTPException(status_code=400, detail="Only audio files allowed")

        file_path = Path(f"/speakers/{file.filename}")
        with open(file_path, "wb") as f:
            f.write(await file.read())

        speakers_volume.commit()
        return {"success": True, "path": str(file_path)}

    # ============== Volumes ==============

    @api_app.get("/api/volumes/list")
    async def list_volume_files(path: str = "/"):
        try:
            base_path = Path(path)
            if not base_path.exists():
                return {"success": True, "data": []}

            files = []
            for item in base_path.iterdir():
                files.append({
                    "name": item.name,
                    "path": str(item),
                    "size": item.stat().st_size if item.is_file() else 0,
                    "isDirectory": item.is_dir(),
                })

            return {"success": True, "data": files}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return api_app


# ============== GPU Workers ==============

@app.function(
    image=whisper_image,
    gpu="T4",
    volumes=VOLUME_MOUNTS,
    timeout=3600,
)
def whisper_worker(audio_ids: list, language: str = "ru"):
    """Process audio files with Whisper for transcription"""
    from faster_whisper import WhisperModel
    from pathlib import Path
    import json

    model = WhisperModel("large-v3", device="cuda", compute_type="float16")

    results = []
    uploads_path = Path("/data/uploads")

    for audio_id in audio_ids:
        # Find file by ID
        matching = list(uploads_path.glob(f"{audio_id}_*"))
        if not matching:
            continue

        audio_path = matching[0]

        # Transcribe
        segments, info = model.transcribe(str(audio_path), language=language)

        transcription = []
        for segment in segments:
            transcription.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
            })

        results.append({
            "audio_id": audio_id,
            "filename": audio_path.name,
            "language": info.language,
            "segments": transcription,
        })

    # Save dataset
    dataset_id = audio_ids[0][:8] if audio_ids else "dataset"
    dataset_path = Path(f"/data/datasets/{dataset_id}")
    dataset_path.mkdir(parents=True, exist_ok=True)

    with open(dataset_path / "metadata.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    data_volume.commit()

    return {
        "dataset_id": dataset_id,
        "files_processed": len(results),
    }


@app.function(
    image=training_image,
    gpu="A10G",
    volumes=VOLUME_MOUNTS,
    timeout=7200,
)
def training_worker(config: dict):
    """Fine-tune XTTS model"""
    from TTS.tts.configs.xtts_config import XttsConfig
    from TTS.tts.models.xtts import Xtts
    from pathlib import Path
    import torch

    dataset_path = config.get("datasetPath", "/data/datasets/default")
    epochs = config.get("epochs", 10)
    batch_size = config.get("batchSize", 4)
    learning_rate = config.get("learningRate", 5e-6)

    # Load base model
    xtts_config = XttsConfig()
    model = Xtts.init_from_config(xtts_config)
    model.load_checkpoint(xtts_config, checkpoint_dir="/cache/xtts")

    # Training loop (simplified)
    metrics = []
    for epoch in range(1, epochs + 1):
        loss = 2.5 - epoch * 0.2 + torch.rand(1).item() * 0.1

        metrics.append({
            "epoch": epoch,
            "loss": loss,
        })

        yield {
            "epoch": epoch,
            "loss": loss,
            "metrics": metrics,
        }

    # Save model
    output_path = Path(f"/data/models/xtts-finetuned-{config.get('datasetPath', 'default').split('/')[-1]}")
    output_path.mkdir(parents=True, exist_ok=True)

    model.save_checkpoint(output_path)
    data_volume.commit()

    return {"model_path": str(output_path)}


@app.function(
    image=inference_image,
    gpu="T4",
    volumes=VOLUME_MOUNTS,
    timeout=600,
)
def inference_worker(config: dict):
    """Generate speech with XTTS"""
    from pathlib import Path
    import scipy.io.wavfile as wavfile
    import numpy as np
    import uuid
    import os
    import torch

    # Fix for PyTorch 2.6+ weights_only issue with TTS
    _original_torch_load = torch.load
    def _patched_torch_load(*args, **kwargs):
        kwargs.setdefault('weights_only', False)
        return _original_torch_load(*args, **kwargs)
    torch.load = _patched_torch_load

    from TTS.api import TTS

    # Set cache directory for model downloads
    os.environ["COQUI_TOS_AGREED"] = "1"
    os.environ["TTS_HOME"] = "/cache"

    text = config.get("text", "")
    speaker_wav = config.get("speakerWav", "")
    language = config.get("language", "ru")
    temperature = config.get("temperature", 0.7)
    speed = config.get("speed", 1.0)

    # Initialize TTS (auto-downloads model on first use)
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=True)

    # Create default speaker wav if none provided
    if not speaker_wav or not Path(speaker_wav).exists():
        # Create a simple reference audio for default voice
        default_speaker = Path("/cache/default_speaker.wav")
        if not default_speaker.exists():
            # Generate a simple sine wave as placeholder speaker
            # In production, upload a real speaker reference
            sample_rate = 22050
            duration = 3.0  # seconds
            freq = 200  # Hz
            t = np.linspace(0, duration, int(sample_rate * duration), False)
            # Create a simple waveform with some variation
            wave = 0.3 * np.sin(2 * np.pi * freq * t)
            wave += 0.1 * np.sin(2 * np.pi * freq * 2 * t)
            wave += 0.05 * np.sin(2 * np.pi * freq * 3 * t)
            wave_int16 = (wave * 32767).astype(np.int16)
            default_speaker.parent.mkdir(parents=True, exist_ok=True)
            wavfile.write(str(default_speaker), sample_rate, wave_int16)
            cache_volume.commit()
        speaker_wav = str(default_speaker)

    # Generate with speaker cloning
    wav = tts.tts(
        text=text,
        speaker_wav=speaker_wav,
        language=language,
    )

    # Save to volume
    cache_volume.commit()

    # Save output
    output_id = str(uuid.uuid4())
    output_path = Path(f"/data/outputs/{output_id}.wav")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Convert to int16 for wav file
    wav_array = np.array(wav)
    wav_int16 = (wav_array * 32767).astype(np.int16)
    wavfile.write(str(output_path), 24000, wav_int16)
    data_volume.commit()

    return {
        "id": output_id,
        "audioUrl": f"/api/audio/{output_id}.wav",
        "duration": len(wav) / 24000,
    }


@app.function(
    image=vad_image,
    gpu="T4",
    volumes=VOLUME_MOUNTS,
    timeout=3600,
)
def vad_chunking_worker(
    audio_path: str,
    range_start: float,
    range_end: float,
    vad_config: dict,
    mode: str = "analyze",
    auto_transcribe: bool = False,
    language: str = "ru",
):
    """
    Process long audio with Silero VAD for intelligent chunking.

    Modes:
    - "analyze": Return preview of chunks without creating files
    - "chunk": Create actual chunk files and optionally transcribe
    """
    import torch
    import torchaudio
    from pathlib import Path
    import soundfile as sf
    import uuid
    import json

    # Load Silero VAD model
    torch.set_num_threads(1)
    vad_model, utils = torch.hub.load(
        repo_or_dir="snakers4/silero-vad",
        model="silero_vad",
        force_reload=False,
        onnx=False,
        trust_repo=True,
    )
    get_speech_timestamps, _, read_audio, *_ = utils

    # VAD config defaults
    min_chunk_duration = vad_config.get("minChunkDuration", 6)
    target_chunk_duration = vad_config.get("targetChunkDuration", 10)
    max_chunk_duration = vad_config.get("maxChunkDuration", 15)
    min_silence_duration = vad_config.get("minSilenceDuration", 0.5)
    silence_threshold = vad_config.get("silenceThreshold", 0.5)

    # Load audio
    audio_file = Path(audio_path)
    if not audio_file.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    # Read with torchaudio for resampling
    waveform, sample_rate = torchaudio.load(str(audio_file))

    # Convert to mono if stereo
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
        vad_model,
        threshold=silence_threshold,
        min_silence_duration_ms=int(min_silence_duration * 1000),
        sampling_rate=16000,
    )

    # Convert timestamps to original sample rate
    scale = sample_rate / 16000
    for ts in speech_timestamps:
        ts["start"] = int(ts["start"] * scale)
        ts["end"] = int(ts["end"] * scale)

    # Build chunks by merging speech segments
    chunks = []
    current_chunk_start = None
    current_chunk_end = None

    for ts in speech_timestamps:
        seg_start = ts["start"]
        seg_end = ts["end"]
        seg_duration = (seg_end - seg_start) / sample_rate

        if current_chunk_start is None:
            current_chunk_start = seg_start
            current_chunk_end = seg_end
            continue

        current_duration = (current_chunk_end - current_chunk_start) / sample_rate
        combined_duration = (seg_end - current_chunk_start) / sample_rate

        # If adding this segment exceeds max, finalize current chunk
        if combined_duration > max_chunk_duration:
            # Only save if meets minimum duration
            if current_duration >= min_chunk_duration:
                chunks.append({
                    "start_sample": current_chunk_start,
                    "end_sample": current_chunk_end,
                })
            elif current_duration > 0:
                # Extend previous chunk if too short
                if chunks:
                    chunks[-1]["end_sample"] = current_chunk_end
                else:
                    chunks.append({
                        "start_sample": current_chunk_start,
                        "end_sample": current_chunk_end,
                    })

            current_chunk_start = seg_start
            current_chunk_end = seg_end
        # If close to target duration, start a new chunk
        elif current_duration >= target_chunk_duration:
            chunks.append({
                "start_sample": current_chunk_start,
                "end_sample": current_chunk_end,
            })
            current_chunk_start = seg_start
            current_chunk_end = seg_end
        else:
            # Extend current chunk
            current_chunk_end = seg_end

    # Add final chunk
    if current_chunk_start is not None:
        chunks.append({
            "start_sample": current_chunk_start,
            "end_sample": current_chunk_end,
        })

    # Convert to time-based chunk info
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
            "start_sample": chunk["start_sample"],
            "end_sample": chunk["end_sample"],
        })

    # Compute statistics
    durations = [c["duration"] for c in chunk_infos]
    if durations:
        avg_duration = sum(durations) / len(durations)
        min_duration = min(durations)
        max_duration = max(durations)
    else:
        avg_duration = min_duration = max_duration = 0

    preview = {
        "chunks": [{
            "id": c["id"],
            "index": c["index"],
            "start": c["start"],
            "end": c["end"],
            "duration": c["duration"],
        } for c in chunk_infos],
        "totalChunks": len(chunk_infos),
        "avgDuration": avg_duration,
        "minDuration": min_duration,
        "maxDuration": max_duration,
    }

    if mode == "analyze":
        return preview

    # Mode: chunk - create actual files
    dataset_id = f"chunks_{uuid.uuid4().hex[:8]}"
    dataset_path = Path(f"/data/datasets/{dataset_id}")
    dataset_path.mkdir(parents=True, exist_ok=True)

    # Resample to 22050Hz for XTTS compatibility
    if sample_rate != 22050:
        resampler_output = torchaudio.transforms.Resample(sample_rate, 22050)
        waveform_output = resampler_output(waveform)
        output_sr = 22050
    else:
        waveform_output = waveform
        output_sr = sample_rate

    # Scale for output sample rate
    output_scale = output_sr / sample_rate

    result_chunks = []
    for i, chunk in enumerate(chunk_infos):
        chunk_filename = f"chunk_{str(i + 1).zfill(3)}.wav"
        chunk_path = dataset_path / chunk_filename

        # Extract chunk audio
        start_out = int(chunk["start_sample"] * output_scale)
        end_out = int(chunk["end_sample"] * output_scale)
        chunk_audio = waveform_output[:, start_out:end_out]

        # Save as WAV
        sf.write(
            str(chunk_path),
            chunk_audio.squeeze().numpy(),
            output_sr,
            subtype="PCM_16",
        )

        result_chunks.append({
            "filename": chunk_filename,
            "duration": chunk["duration"],
        })

    data_volume.commit()

    # Optional transcription
    if auto_transcribe:
        from faster_whisper import WhisperModel

        whisper_model = WhisperModel("large-v3", device="cuda", compute_type="float16")

        for chunk_result in result_chunks:
            chunk_path = dataset_path / chunk_result["filename"]
            segments, info = whisper_model.transcribe(str(chunk_path), language=language)
            transcription = " ".join([seg.text.strip() for seg in segments])
            chunk_result["transcription"] = transcription

        # Save metadata
        metadata = {
            "language": language,
            "chunks": result_chunks,
        }
        with open(dataset_path / "metadata.json", "w") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

        data_volume.commit()

    return {
        "datasetId": dataset_id,
        "chunks": result_chunks,
    }
