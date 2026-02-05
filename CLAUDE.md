# XTTS Server & Fine-tune

## Обзор проекта

Web UI для fine-tuning и инференса XTTS v2 (Coqui TTS) на локальном GPU сервере.

**Стек:**
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** FastAPI + GPU workers (PyTorch, CUDA)
- **ML:** XTTS v2, Whisper (faster-whisper), Silero VAD

---

## Быстрый старт

```bash
# 1. Установка зависимостей
npm install
pip install -r backend/requirements.txt

# 2. Запуск (два терминала)
./scripts/start-backend.sh   # → http://localhost:8000
./scripts/start-frontend.sh  # → http://localhost:3000

# Или одной командой:
./scripts/start-all.sh
```

**Авторизация:** admin / xtts2024

---

## Структура проекта

```
.
├── app/                           # Next.js App Router
│   ├── layout.tsx                 # Root layout
│   ├── login/page.tsx             # Страница входа
│   ├── (dashboard)/               # Защищённые страницы
│   │   ├── layout.tsx             # Dashboard layout + Navigation
│   │   ├── page.tsx               # Главная
│   │   ├── data-processing/       # Upload + Whisper + Long Audio VAD
│   │   ├── training/              # Fine-tuning
│   │   ├── inference/             # TTS генерация
│   │   └── settings/              # Настройки
│   └── api/                       # API Routes (proxy to backend)
│       ├── auth/                  # login, logout, check
│       ├── data/                  # upload, process, analyze, chunk, datasets
│       ├── training/              # start, progress, models
│       └── inference/             # generate, speakers, audio
│
├── backend/                       # FastAPI Backend (GPU)
│   ├── main.py                    # FastAPI app + CORS
│   ├── config.py                  # Пути к директориям
│   ├── requirements.txt           # Python зависимости
│   ├── routes/
│   │   ├── data.py                # Upload, process, analyze, chunk
│   │   ├── training.py            # Training jobs + SSE
│   │   └── inference.py           # TTS generate, speakers
│   └── workers/
│       ├── whisper.py             # WhisperWorker (faster-whisper)
│       ├── inference.py           # InferenceWorker (XTTS)
│       ├── vad.py                 # VADWorker (Silero VAD + chunking)
│       └── training.py            # TrainingWorker (XTTS fine-tune)
│
├── components/
│   ├── Navigation.tsx             # Sidebar навигация
│   ├── audio/                     # Long Audio компоненты
│   │   ├── LongAudioProcessor.tsx # Главный компонент chunking
│   │   ├── AudioWaveform.tsx      # Визуализация waveform
│   │   ├── AudioRangeSelector.tsx # Выбор диапазона
│   │   ├── VADSettingsPanel.tsx   # Настройки VAD
│   │   ├── ChunkStatistics.tsx    # Статистика чанков
│   │   ├── AudioPlayer.tsx        # Плеер
│   │   └── AudioTimeInput.tsx     # Ввод времени
│   └── ui/                        # shadcn/ui компоненты
│
├── lib/
│   ├── api.ts                     # API client
│   ├── auth.ts                    # JWT utilities
│   ├── types.ts                   # TypeScript типы
│   └── utils.ts                   # Helpers (cn, formatBytes, formatDuration)
│
├── scripts/
│   ├── start-backend.sh           # Запуск FastAPI
│   ├── start-frontend.sh          # Запуск Next.js
│   └── start-all.sh               # Запуск всего
│
├── middleware.ts                  # Auth middleware
├── DEPLOY.md                      # Инструкция деплоя на GPU сервер
└── USAGE.md                       # Руководство пользователя
```

---

## Backend API

### Endpoints

| Route | Метод | Описание |
|-------|-------|----------|
| `/health` | GET | Health check + GPU info |
| `/api/data/upload` | POST | Загрузка файлов |
| `/api/data/process` | POST | Whisper транскрипция |
| `/api/data/progress/{id}` | GET (SSE) | Прогресс обработки |
| `/api/data/analyze` | POST | VAD preview |
| `/api/data/chunk` | POST | VAD chunking |
| `/api/data/chunk/progress/{id}` | GET (SSE) | Прогресс chunking |
| `/api/data/datasets` | GET | Список датасетов |
| `/api/training/start` | POST | Запуск обучения |
| `/api/training/progress/{id}` | GET (SSE) | Метрики обучения |
| `/api/training/models` | GET | Список моделей |
| `/api/inference/generate` | POST | TTS генерация |
| `/api/inference/speakers` | GET | Список голосов |

### Swagger UI

http://localhost:8000/docs

---

## Переменные окружения

```env
# Authentication
AUTH_USER=admin
AUTH_PASSWORD=xtts2024
JWT_SECRET=your-secret-key

# Backend
BACKEND_URL=http://localhost:8000

# Директории данных
UPLOAD_DIR=/data/xtts/uploads
DATASETS_DIR=/data/xtts/datasets
OUTPUT_DIR=/data/xtts/outputs
SPEAKERS_DIR=/data/xtts/speakers
MODELS_DIR=/data/xtts/models
CACHE_DIR=/data/xtts/cache
```

---

## Workers

| Worker | Назначение | Модель |
|--------|------------|--------|
| `WhisperWorker` | Транскрипция | faster-whisper large-v3 |
| `InferenceWorker` | TTS генерация | XTTS v2 |
| `VADWorker` | VAD + chunking | Silero VAD |
| `TrainingWorker` | Fine-tuning | XTTS v2 |

### Singleton паттерн
Все workers используют singleton для экономии памяти GPU. Модели загружаются lazy при первом использовании.

---

## Зависимости Backend

```txt
# Web framework
fastapi>=0.109.0
uvicorn>=0.27.0
python-multipart>=0.0.6
aiofiles>=23.2.1

# Audio processing
pydub>=0.25.1
soundfile>=0.12.0
scipy>=1.11.0

# ML
faster-whisper>=1.0.0
TTS>=0.22.0
transformers>=4.36.0,<4.40.0

# PyTorch (install separately)
# pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

---

## Технические детали

### Требования к GPU
- NVIDIA GPU с CUDA support
- Минимум 8GB VRAM (рекомендуется 12GB+)
- CUDA 11.8+ или 12.x
- cuDNN

### Выходной формат
- Audio: WAV, 22050 Hz, mono, PCM 16-bit
- Chunks: chunk_001.wav, chunk_002.wav, ...
- Metadata: metadata.json

---

## Команды

```bash
# Разработка
./scripts/start-all.sh       # Запуск всего
npm run dev                  # Только frontend
python -m backend.main       # Только backend

# Production build
npm run build
npm start

# Линтинг
npm run lint
```

---

## Документация

- [DEPLOY.md](./DEPLOY.md) — деплой на GPU сервер
- [USAGE.md](./USAGE.md) — руководство пользователя
