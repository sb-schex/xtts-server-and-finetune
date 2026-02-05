"""
XTTS Backend - FastAPI server with GPU workers
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn

from .config import HOST, PORT
from .routes import data, training, inference


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    print("Starting XTTS Backend...")
    print(f"Server running at http://{HOST}:{PORT}")
    yield
    print("Shutting down XTTS Backend...")


app = FastAPI(
    title="XTTS API",
    description="Backend for XTTS fine-tuning and inference",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(data.router, prefix="/api/data", tags=["Data Processing"])
app.include_router(training.router, prefix="/api/training", tags=["Training"])
app.include_router(inference.router, prefix="/api/inference", tags=["Inference"])


@app.get("/health")
async def health():
    """Health check endpoint"""
    import torch
    return {
        "status": "ok",
        "cuda_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }


@app.get("/")
async def root():
    return {"message": "XTTS API", "docs": "/docs"}


if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host=HOST,
        port=PORT,
        reload=True,
    )
