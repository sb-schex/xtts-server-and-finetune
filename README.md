# XTTS Server & Fine-tune

Web UI для fine-tuning и инференса [XTTS v2](https://github.com/coqui-ai/TTS) с использованием [Modal.com](https://modal.com) для GPU вычислений.

## Возможности

- **Data Processing** — загрузка аудио, транскрипция через Whisper
- **Long Audio Processing** — разбиение длинных аудио по паузам (Silero VAD)
- **Training** — fine-tuning XTTS модели с real-time метриками
- **Inference** — генерация речи с клонированием голоса

## Технологии

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend:** Modal.com (FastAPI + GPU workers)
- **ML:** XTTS v2, faster-whisper, Silero VAD

## Быстрый старт

### Требования

- Node.js 18+
- Python 3.11+
- [Modal CLI](https://modal.com/docs/guide/cli)

### Установка

```bash
# Клонировать репозиторий
git clone https://github.com/your-username/xtts-server-and-finetune.git
cd xtts-server-and-finetune

# Установить зависимости
npm install

# Настроить переменные окружения
cp .env.example .env.local
# Отредактировать .env.local
```

### Запуск

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend (Modal)
modal serve modal/app.py
```

Открыть http://localhost:3000

**Логин:** `admin` / `xtts2024`

## Структура

```
├── app/                  # Next.js страницы и API
├── components/           # React компоненты
│   ├── audio/           # Long Audio Processing
│   └── ui/              # shadcn/ui
├── lib/                 # Утилиты, типы, API клиент
├── modal/               # Modal backend
│   └── app.py          # FastAPI + GPU workers
└── CLAUDE.md           # Контекст проекта для AI
```

## Документация

- [CLAUDE.md](./CLAUDE.md) — контекст проекта
- [USAGE.md](./USAGE.md) — руководство пользователя

## Лицензия

MIT
