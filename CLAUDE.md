# XTTS Server & Fine-tune

## Обзор проекта

Web UI для fine-tuning и инференса XTTS v2 (Coqui TTS).

**Варианты деплоя:**
- **Локальный GPU сервер** (RTX 3060 и др.) — рекомендуется
- **Modal.com** (облако) — legacy

**Стек:**
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** FastAPI + GPU workers (PyTorch, CUDA)
- **ML:** XTTS v2, Whisper (faster-whisper), Silero VAD

---

## Быстрый старт

### Локальный сервер (рекомендуется)

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

### Modal (облако)

```bash
npm install
npm run dev                  # Terminal 1
modal serve modal/app.py     # Terminal 2
```

**Авторизация:** admin / xtts2024

---

## Структура проекта

```
.
├── app/                      # Next.js App Router
│   ├── (dashboard)/          # Защищённые страницы
│   │   ├── data-processing/  # Upload + Whisper + Long Audio VAD
│   │   ├── training/         # Fine-tuning
│   │   ├── inference/        # TTS генерация
│   │   └── settings/         # Настройки
│   ├── api/                  # API routes (proxy to backend)
│   └── login/                # Страница входа
│
├── backend/                  # FastAPI Backend (LOCAL GPU)
│   ├── main.py              # FastAPI приложение
│   ├── config.py            # Конфигурация
│   ├── requirements.txt     # Python зависимости
│   ├── workers/             # GPU workers
│   │   ├── whisper.py       # Транскрипция
│   │   ├── inference.py     # TTS генерация
│   │   ├── vad.py           # VAD + chunking
│   │   └── training.py      # Fine-tuning
│   └── routes/              # API endpoints
│       ├── data.py          # Upload, process, chunk
│       ├── training.py      # Training jobs
│       └── inference.py     # TTS generation
│
├── modal/                   # Modal Backend (CLOUD)
│   └── app.py               # Modal workers
│
├── components/
│   ├── audio/               # Long Audio компоненты
│   └── ui/                  # shadcn/ui компоненты
│
├── lib/                     # Утилиты, типы, API клиент
├── scripts/                 # Скрипты запуска
│   ├── start-backend.sh
│   ├── start-frontend.sh
│   └── start-all.sh
│
├── DEPLOY.md                # План деплоя на GPU сервер
└── USAGE.md                 # Руководство пользователя
```

---

## Backend API

### Endpoints

| Route | Метод | Описание |
|-------|-------|----------|
| `/health` | GET | Health check + GPU info |
| `/api/data/upload` | POST | Загрузка файлов |
| `/api/data/process` | POST | Whisper транскрипция |
| `/api/data/progress/{id}` | GET (SSE) | Прогресс |
| `/api/data/analyze` | POST | VAD preview |
| `/api/data/chunk` | POST | VAD chunking |
| `/api/data/chunk/progress/{id}` | GET (SSE) | Прогресс chunking |
| `/api/data/datasets` | GET | Список датасетов |
| `/api/training/start` | POST | Запуск обучения |
| `/api/training/progress/{id}` | GET (SSE) | Метрики |
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

# Backend (выбрать один)
BACKEND_URL=http://localhost:8000   # Локальный GPU
# MODAL_API_URL=https://...          # Modal cloud

# Директории данных
UPLOAD_DIR=/data/xtts/uploads
DATASETS_DIR=/data/xtts/datasets
OUTPUT_DIR=/data/xtts/outputs
SPEAKERS_DIR=/data/xtts/speakers
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

## Технические детали

### Требования к GPU
- NVIDIA GPU с CUDA support
- Минимум 8GB VRAM (рекомендуется 12GB+)
- CUDA 11.8+ или 12.x
- cuDNN

### Совместимость PyTorch
```python
transformers>=4.36.0,<4.40.0  # BeamSearchScorer удалён в 4.40+
torch>=2.1.0
torchaudio>=2.1.0
```

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

- [DEPLOY.md](./DEPLOY.md) — план деплоя на GPU сервер
- [USAGE.md](./USAGE.md) — руководство пользователя
