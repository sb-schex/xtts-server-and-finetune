"""
Data Processing Routes - Upload, transcription, VAD chunking
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from pathlib import Path
import uuid
import json
import asyncio
from typing import Optional

from ..config import UPLOAD_DIR, DATASETS_DIR
from ..workers.whisper import whisper_worker
from ..workers.vad import vad_worker

router = APIRouter()

# Job storage (in-memory, replace with Redis for production)
jobs: dict[str, dict] = {}


# ============== Upload ==============

@router.post("/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    """Upload audio files"""
    uploaded = []

    for file in files:
        if not file.content_type or not file.content_type.startswith("audio/"):
            continue

        file_id = str(uuid.uuid4())
        ext = Path(file.filename).suffix or ".wav"
        filename = f"{file_id}{ext}"
        filepath = UPLOAD_DIR / filename

        content = await file.read()
        with open(filepath, "wb") as f:
            f.write(content)

        uploaded.append({
            "id": file_id,
            "filename": file.filename,
            "savedAs": filename,
            "size": len(content),
            "path": str(filepath),
        })

    return {"success": True, "files": uploaded}


# ============== Whisper Processing ==============

@router.post("/process")
async def start_processing(request: dict, background_tasks: BackgroundTasks):
    """Start Whisper transcription job"""
    files = request.get("files", [])
    language = request.get("language", "ru")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "message": "Starting...",
    }

    background_tasks.add_task(run_whisper_job, job_id, files, language)

    return {"success": True, "jobId": job_id}


def run_whisper_job(job_id: str, files: list, language: str):
    """Background task for Whisper processing"""
    def on_progress(progress: int, message: str):
        jobs[job_id]["progress"] = progress
        jobs[job_id]["message"] = message

    try:
        jobs[job_id]["status"] = "processing"
        result = whisper_worker.process_files(files, language, on_progress)

        jobs[job_id] = {
            "status": "completed",
            "progress": 100,
            "message": "Processing complete",
            "result": result,
        }
    except Exception as e:
        jobs[job_id] = {
            "status": "failed",
            "error": str(e),
            "message": str(e),
        }


@router.get("/progress/{job_id}")
async def get_progress(job_id: str):
    """SSE endpoint for job progress"""
    async def event_stream():
        while True:
            if job_id not in jobs:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                break

            job = jobs[job_id]
            yield f"data: {json.dumps(job)}\n\n"

            if job["status"] in ["completed", "failed"]:
                yield f"event: complete\ndata: {json.dumps(job)}\n\n"
                # Cleanup after 5 minutes
                asyncio.get_event_loop().call_later(300, lambda: jobs.pop(job_id, None))
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ============== VAD Chunking ==============

@router.post("/analyze")
async def analyze_audio(request: dict):
    """Analyze audio with VAD (preview only)"""
    audio_path = request.get("audioPath", "")
    range_info = request.get("range", {})
    vad_config = request.get("vadConfig", {})

    if not audio_path or not Path(audio_path).exists():
        raise HTTPException(status_code=400, detail="Audio file not found")

    try:
        preview = vad_worker.analyze(
            audio_path,
            range_info.get("start", 0),
            range_info.get("end", 0),
            vad_config,
        )
        return {"success": True, "preview": preview}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chunk")
async def start_chunking(request: dict, background_tasks: BackgroundTasks):
    """Start VAD chunking job"""
    audio_path = request.get("audioPath", "")
    range_info = request.get("range", {})
    vad_config = request.get("vadConfig", {})
    auto_transcribe = request.get("autoTranscribe", False)
    language = request.get("language", "ru")

    if not audio_path or not Path(audio_path).exists():
        raise HTTPException(status_code=400, detail="Audio file not found")

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "message": "Starting...",
    }

    background_tasks.add_task(
        run_chunking_job,
        job_id,
        audio_path,
        range_info,
        vad_config,
        auto_transcribe,
        language,
    )

    return {"success": True, "jobId": job_id}


def run_chunking_job(
    job_id: str,
    audio_path: str,
    range_info: dict,
    vad_config: dict,
    auto_transcribe: bool,
    language: str,
):
    """Background task for VAD chunking"""
    def on_progress(progress: int, message: str):
        jobs[job_id]["progress"] = progress
        jobs[job_id]["message"] = message

    try:
        jobs[job_id]["status"] = "processing"
        result = vad_worker.process(
            audio_path,
            range_info.get("start", 0),
            range_info.get("end", 0),
            vad_config,
            auto_transcribe,
            language,
            on_progress,
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
            "message": str(e),
        }


@router.get("/chunk/progress/{job_id}")
async def get_chunking_progress(job_id: str):
    """SSE endpoint for chunking job progress"""
    return await get_progress(job_id)


# ============== Audio Streaming ==============

@router.get("/audio/{file_id}")
async def stream_audio(file_id: str):
    """Stream audio file"""
    # Try upload directory
    for ext in [".wav", ".mp3", ".flac", ".ogg", ".m4a"]:
        filepath = UPLOAD_DIR / f"{file_id}{ext}"
        if filepath.exists():
            return FileResponse(
                filepath,
                media_type=f"audio/{ext[1:]}",
            )

    # Try direct filename
    filepath = UPLOAD_DIR / file_id
    if filepath.exists():
        ext = filepath.suffix.lower()
        content_types = {
            ".wav": "audio/wav",
            ".mp3": "audio/mpeg",
            ".ogg": "audio/ogg",
            ".flac": "audio/flac",
            ".m4a": "audio/mp4",
        }
        return FileResponse(
            filepath,
            media_type=content_types.get(ext, "application/octet-stream"),
        )

    raise HTTPException(status_code=404, detail="File not found")


# ============== Datasets ==============

@router.get("/datasets")
async def list_datasets():
    """List available datasets"""
    datasets = []

    if DATASETS_DIR.exists():
        for item in DATASETS_DIR.iterdir():
            if item.is_dir():
                metadata_file = item / "metadata.json"
                info = {}
                if metadata_file.exists():
                    with open(metadata_file, "r") as f:
                        info = json.load(f)

                datasets.append({
                    "name": item.name,
                    "path": str(item),
                    "chunks": len(info.get("chunks", [])) if isinstance(info, dict) else len(info) if isinstance(info, list) else 0,
                })

    return {"success": True, "data": datasets}
