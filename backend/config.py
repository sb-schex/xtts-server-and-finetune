"""
Backend configuration
"""
import os
from pathlib import Path

# Base directories
DATA_DIR = Path(os.getenv("DATA_DIR", "/data/xtts"))
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", DATA_DIR / "uploads"))
DATASETS_DIR = Path(os.getenv("DATASETS_DIR", DATA_DIR / "datasets"))
MODELS_DIR = Path(os.getenv("MODELS_DIR", DATA_DIR / "models"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", DATA_DIR / "outputs"))
SPEAKERS_DIR = Path(os.getenv("SPEAKERS_DIR", DATA_DIR / "speakers"))
CACHE_DIR = Path(os.getenv("CACHE_DIR", DATA_DIR / "cache"))

# Create directories
for d in [UPLOAD_DIR, DATASETS_DIR, MODELS_DIR, OUTPUT_DIR, SPEAKERS_DIR, CACHE_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# TTS settings
os.environ["COQUI_TOS_AGREED"] = "1"
os.environ["TTS_HOME"] = str(CACHE_DIR)

# Server settings
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8000))

# Model settings
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "large-v3")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cuda")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")

XTTS_MODEL = os.getenv("XTTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")
