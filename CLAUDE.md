# XTTS Server & Fine-tune

## Обзор проекта

Web UI для fine-tuning и инференса XTTS v2 (Coqui TTS) с использованием Modal.com для GPU вычислений.

**Стек:**
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Modal.com (FastAPI + GPU workers)
- **ML:** XTTS v2, Whisper (faster-whisper), Silero VAD

---

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Frontend (Terminal 1)
npm run dev
# → http://localhost:3000

# Backend (Terminal 2)
modal serve modal/app.py
# → https://[user]--xtts-webui-api-api-dev.modal.run
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
│   ├── api/                  # API routes
│   │   ├── auth/             # JWT авторизация
│   │   ├── data/             # Upload, process, analyze, chunk
│   │   ├── training/         # Start, progress, models
│   │   └── inference/        # Generate, speakers
│   └── login/                # Страница входа
│
├── components/
│   ├── audio/                # Long Audio компоненты
│   │   ├── AudioWaveform.tsx     # wavesurfer.js визуализация
│   │   ├── AudioRangeSelector.tsx
│   │   ├── AudioPlayer.tsx
│   │   ├── VADSettingsPanel.tsx
│   │   ├── ChunkStatistics.tsx
│   │   └── LongAudioProcessor.tsx
│   ├── ui/                   # shadcn/ui компоненты
│   └── Navigation.tsx
│
├── lib/
│   ├── types.ts              # TypeScript типы
│   ├── auth.ts               # JWT (jose)
│   ├── api.ts                # API клиент + SSE
│   └── utils.ts              # Утилиты
│
├── modal/
│   └── app.py                # Modal backend
│       ├── api()             # FastAPI сервер
│       ├── whisper_worker()  # T4 GPU - транскрипция
│       ├── training_worker() # A10G GPU - обучение
│       ├── inference_worker()# T4 GPU - TTS генерация
│       └── vad_chunking_worker() # T4 GPU - VAD + chunking
│
├── middleware.ts             # JWT middleware
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## Ключевые функции

### 1. Data Processing
- Загрузка аудио файлов (WAV, MP3, FLAC, OGG)
- Транскрипция через Whisper (faster-whisper)
- **Long Audio Processing:**
  - Waveform визуализация (wavesurfer.js)
  - Выбор диапазона (start/end)
  - VAD разбиение по паузам (Silero VAD)
  - Настраиваемые параметры (min/target/max duration)
  - Опциональная авто-транскрипция

### 2. Training
- Fine-tuning XTTS v2
- Real-time метрики через SSE
- Сохранение чекпоинтов

### 3. Inference
- Генерация речи с клонированием голоса
- Настройки: temperature, speed, top_k, top_p
- Audio player с прогрессом

---

## API Routes

| Route | Метод | Описание |
|-------|-------|----------|
| `/api/auth/login` | POST | JWT авторизация |
| `/api/data/upload` | POST | Загрузка файлов |
| `/api/data/process` | POST | Whisper транскрипция |
| `/api/data/analyze` | POST | VAD preview |
| `/api/data/chunk` | POST | VAD chunking |
| `/api/data/chunk/progress/[id]` | GET (SSE) | Прогресс |
| `/api/training/start` | POST | Запуск обучения |
| `/api/training/progress/[id]` | GET (SSE) | Метрики |
| `/api/inference/generate` | POST | TTS генерация |

---

## Modal Workers

| Worker | GPU | Timeout | Назначение |
|--------|-----|---------|------------|
| `whisper_worker` | T4 | 1h | Транскрипция |
| `training_worker` | A10G | 2h | Fine-tuning |
| `inference_worker` | T4 | 10m | TTS |
| `vad_chunking_worker` | T4 | 1h | VAD + chunking |

---

## Переменные окружения

```env
AUTH_USER=admin
AUTH_PASSWORD=xtts2024
JWT_SECRET=your-secret-key
MODAL_API_URL=https://[user]--xtts-webui-api-api-dev.modal.run
```

---

## Технические детали

### Совместимость
- `transformers>=4.36.0,<4.40.0` — BeamSearchScorer удалён в 4.40+
- `torchcodec` — требуется для torchaudio
- Патч `torch.load` с `weights_only=False` для TTS

### Выходной формат чанков
- WAV, 22050 Hz, mono, PCM 16-bit
- Именование: chunk_001.wav, chunk_002.wav, ...
- metadata.json с транскрипциями

### Modal Volumes
- `xtts-finetune-data` — данные, датасеты, модели
- `xtts-model-cache` — кэш XTTS модели
- `xtts-speakers` — speaker WAV файлы

---

## Команды

```bash
# Разработка
npm run dev              # Frontend dev server
modal serve modal/app.py # Backend dev server

# Деплой
npm run build            # Build frontend
modal deploy modal/app.py # Deploy backend

# Линтинг
npm run lint
```

---

## Заметки для разработки

- SSE используется для real-time прогресса (data processing, training, chunking)
- JWT токены хранятся в httpOnly cookies
- Middleware защищает все маршруты кроме /login и /api/auth
- wavesurfer.js требует клиентского рендеринга ('use client')
- Silero VAD загружается через torch.hub
