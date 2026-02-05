"""
Training Routes - XTTS fine-tuning
"""
from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import StreamingResponse
import uuid
import json
import asyncio

from ..workers.training import training_worker

router = APIRouter()

# Job storage
jobs: dict[str, dict] = {}


@router.post("/start")
async def start_training(request: dict, background_tasks: BackgroundTasks):
    """Start training job"""
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


def run_training_job(job_id: str, config: dict):
    """Background task for training"""
    try:
        jobs[job_id]["status"] = "training"

        for update in training_worker.train(config):
            if "error" in update:
                jobs[job_id] = {
                    "status": "failed",
                    "error": update["error"],
                }
                return

            jobs[job_id].update(update)

        jobs[job_id]["status"] = "completed"

    except Exception as e:
        jobs[job_id] = {
            "status": "failed",
            "error": str(e),
        }


@router.get("/progress/{job_id}")
async def get_training_progress(job_id: str):
    """SSE endpoint for training progress"""
    async def event_stream():
        while True:
            if job_id not in jobs:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                break

            job = jobs[job_id]
            yield f"data: {json.dumps(job)}\n\n"

            if job["status"] in ["completed", "failed"]:
                yield f"event: complete\ndata: {json.dumps(job)}\n\n"
                # Cleanup after 1 hour
                asyncio.get_event_loop().call_later(3600, lambda: jobs.pop(job_id, None))
                break

            await asyncio.sleep(1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/stop/{job_id}")
async def stop_training(job_id: str):
    """Stop training job"""
    if job_id in jobs:
        jobs[job_id]["status"] = "stopped"
        return {"success": True}
    return {"success": False, "error": "Job not found"}


@router.get("/models")
async def list_models():
    """List trained models"""
    models = training_worker.list_models()
    return {"success": True, "data": models}
