# XTTS Server & Fine-tune

Web UI для fine-tuning и инференса [XTTS v2](https://github.com/coqui-ai/TTS) на локальном GPU сервере.

## Возможности

- **Data Processing** — загрузка аудио, транскрипция через Whisper
- **Long Audio Processing** — разбиение длинных аудио по паузам (Silero VAD)
- **Training** — fine-tuning XTTS модели с real-time метриками
- **Inference** — генерация речи с клонированием голоса

## Технологии

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend:** FastAPI + GPU workers (PyTorch, CUDA)
- **ML:** XTTS v2, faster-whisper, Silero VAD

## Требования

- **GPU:** NVIDIA с 8GB+ VRAM (рекомендуется 12GB+)
- **CUDA:** 11.8+ или 12.x
- **Node.js:** 18+
- **Python:** 3.11+

## Быстрый старт

```bash
# Клонировать репозиторий
git clone https://github.com/your-username/xtts-server-and-finetune.git
cd xtts-server-and-finetune

# Установить зависимости
npm install
pip install -r backend/requirements.txt

# Настроить переменные окружения
cp .env.example .env.local

# Запуск (два терминала)
./scripts/start-backend.sh   # Terminal 1 → http://localhost:8000
./scripts/start-frontend.sh  # Terminal 2 → http://localhost:3000

# Или одной командой:
./scripts/start-all.sh
```

Открыть http://localhost:3000

**Логин:** `admin` / `xtts2024`

## Структура

```
├── app/                  # Next.js страницы и API
├── backend/              # FastAPI backend
│   ├── main.py          # Точка входа
│   ├── workers/         # GPU workers
│   └── routes/          # API endpoints
├── components/           # React компоненты
│   ├── audio/           # Long Audio Processing
│   └── ui/              # shadcn/ui
├── lib/                 # Утилиты, типы, API клиент
├── scripts/             # Скрипты запуска
└── CLAUDE.md            # Контекст проекта для AI
```

## Документация

- [CLAUDE.md](./CLAUDE.md) — контекст проекта
- [DEPLOY.md](./DEPLOY.md) — деплой на GPU сервер
- [USAGE.md](./USAGE.md) — руководство пользователя

## Лицензия

MIT
