"""
Inference Routes - TTS generation
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import uuid

from ..config import OUTPUT_DIR, SPEAKERS_DIR
from ..workers.inference import inference_worker

router = APIRouter()


@router.post("/generate")
async def generate_speech(request: dict):
    """Generate speech from text"""
    text = request.get("text", "")
    speaker_wav = request.get("speakerWav", "")
    language = request.get("language", "ru")
    temperature = request.get("temperature", 0.7)
    speed = request.get("speed", 1.0)
    top_k = request.get("topK", 50)
    top_p = request.get("topP", 0.85)

    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        result = inference_worker.generate(
            text=text,
            speaker_wav=speaker_wav,
            language=language,
            temperature=temperature,
            speed=speed,
            top_k=top_k,
            top_p=top_p,
        )
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audio/{filename}")
async def get_audio(filename: str):
    """Get generated audio file"""
    # Remove .wav if present in filename
    file_id = filename.replace(".wav", "")

    filepath = OUTPUT_DIR / f"{file_id}.wav"
    if not filepath.exists():
        filepath = OUTPUT_DIR / filename
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="Audio not found")

    return FileResponse(
        filepath,
        media_type="audio/wav",
        filename=f"{file_id}.wav",
    )


@router.get("/speakers")
async def list_speakers():
    """List available speaker WAV files"""
    speakers = inference_worker.list_speakers()
    return {"success": True, "data": speakers}


@router.post("/speakers/upload")
async def upload_speaker(file: UploadFile = File(...)):
    """Upload speaker reference audio"""
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Only audio files allowed")

    # Save with original filename or generate new
    filename = file.filename or f"{uuid.uuid4()}.wav"
    filepath = SPEAKERS_DIR / filename

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    return {
        "success": True,
        "name": Path(filename).stem,
        "path": str(filepath),
    }
