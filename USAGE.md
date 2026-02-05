# XTTS Fine-tuning WebUI — Руководство пользователя

> Веб-интерфейс для дообучения и использования XTTS v2 (Text-to-Speech) моделей с GPU-ускорением на Modal.com

---

## Содержание

1. [Обзор](#обзор)
2. [Требования](#требования)
3. [Установка](#установка)
4. [Запуск](#запуск)
5. [Использование интерфейса](#использование-интерфейса)
   - [Авторизация](#авторизация)
   - [Data Processing](#data-processing)
   - [Training](#training)
   - [Inference](#inference)
   - [Settings](#settings)
6. [API Reference](#api-reference)
7. [Архитектура](#архитектура)
8. [Устранение неполадок](#устранение-неполадок)
9. [FAQ](#faq)

---

## Обзор

XTTS WebUI — это современный веб-интерфейс для работы с XTTS v2 (Coqui TTS), позволяющий:

- **Загружать аудиоданные** и автоматически транскрибировать их с помощью Whisper
- **Дообучать XTTS модели** на собственных голосовых данных
- **Генерировать речь** с клонированием голоса на множестве языков

### Поддерживаемые языки

XTTS v2 поддерживает 17 языков:
- Русский (ru), Английский (en), Испанский (es), Французский (fr)
- Немецкий (de), Итальянский (it), Португальский (pt), Польский (pl)
- Турецкий (tr), Голландский (nl), Чешский (cs), Арабский (ar)
- Китайский (zh-cn), Японский (ja), Венгерский (hu), Корейский (ko), Хинди (hi)

---

## Требования

### Локальные требования

- **Node.js** 18+ (рекомендуется 20+)
- **npm** или **yarn**
- **Python** 3.11+ (для Modal CLI)
- **Modal CLI** с активным аккаунтом

### Аккаунт Modal.com

1. Зарегистрируйтесь на [modal.com](https://modal.com)
2. Установите Modal CLI:
   ```bash
   pip install modal
   modal setup
   ```
3. Авторизуйтесь:
   ```bash
   modal token new
   ```

### GPU ресурсы (Modal)

| Задача | GPU | Память | Время |
|--------|-----|--------|-------|
| Whisper (транскрипция) | T4 | 16GB | ~1 мин/файл |
| Training (дообучение) | A10G | 24GB | ~10-60 мин |
| Inference (генерация) | T4 | 16GB | ~5-15 сек |

---

## Установка

### 1. Клонирование репозитория

```bash
git clone <repository-url>
cd xtts-finetune-webui/xtts-webui-nextjs
```

### 2. Установка зависимостей

```bash
npm install
```

### 3. Настройка переменных окружения

Создайте файл `.env.local`:

```env
# Авторизация
AUTH_USER=admin
AUTH_PASSWORD=your_secure_password
JWT_SECRET=your-random-secret-key-min-32-chars

# Modal API (обновится после первого запуска modal serve)
MODAL_API_URL=https://your-workspace--xtts-webui-api-api-dev.modal.run
```

### 4. Настройка Modal секретов (опционально)

```bash
modal secret create xtts-webui-auth \
  AUTH_USER=admin \
  AUTH_PASSWORD=your_password
```

---

## Запуск

### Быстрый старт

Откройте **два терминала**:

**Терминал 1 — Frontend (Next.js):**
```bash
cd xtts-webui-nextjs
npm run dev
```
→ Откроется на http://localhost:3000

**Терминал 2 — Backend (Modal):**
```bash
cd xtts-webui-nextjs
modal serve modal/app.py
```
→ API будет доступен по URL, указанному в выводе

### Production деплой

```bash
# Деплой на Modal (постоянный)
modal deploy modal/app.py

# Build frontend для production
npm run build
npm start
```

---

## Использование интерфейса

### Авторизация

1. Откройте http://localhost:3000
2. Введите логин и пароль (по умолчанию: `admin` / `xtts2024`)
3. После успешной авторизации вы попадёте на главную страницу

### Data Processing

Страница для загрузки и обработки аудиоданных.

#### Загрузка аудио

1. Перетащите аудиофайлы в область загрузки или нажмите для выбора
2. Поддерживаемые форматы: **WAV, MP3, FLAC, OGG, M4A**
3. Рекомендуемые параметры:
   - Длительность: 5-15 секунд на файл
   - Качество: 22050 Hz, mono
   - Общая длительность: 3-10 минут для хорошего результата

#### Обработка (Whisper)

1. После загрузки нажмите **"Process"**
2. Выберите язык аудио
3. Введите имя спикера (например: `ivan_voice`)
4. Дождитесь завершения обработки (прогресс отображается в реальном времени)

**Результат:** Создаётся датасет с транскрипциями в формате, готовом для обучения.

### Training

Страница для дообучения XTTS модели.

#### Параметры обучения

| Параметр | Описание | Рекомендация |
|----------|----------|--------------|
| **Dataset** | Путь к обработанному датасету | Выберите из списка |
| **Epochs** | Количество эпох обучения | 5-20 |
| **Batch Size** | Размер батча | 2-4 (зависит от GPU) |
| **Learning Rate** | Скорость обучения | 5e-6 — 1e-5 |
| **Grad Accumulation** | Накопление градиентов | 1-4 |
| **Max Audio Length** | Макс. длина аудио (сек) | 11 |

#### Процесс обучения

1. Выберите датасет из списка
2. Настройте параметры (или оставьте по умолчанию)
3. Нажмите **"Start Training"**
4. Наблюдайте за метриками в реальном времени:
   - **Epoch** — текущая эпоха
   - **Step** — текущий шаг
   - **Loss** — значение функции потерь (должно уменьшаться)

**Совет:** Loss обычно начинается с ~2.5 и должен снизиться до ~0.5-1.0 для хорошего результата.

### Inference

Страница для генерации речи.

#### Параметры генерации

| Параметр | Описание | Диапазон | По умолчанию |
|----------|----------|----------|--------------|
| **Text** | Текст для озвучки | До 500 символов | — |
| **Language** | Язык текста | 17 языков | ru |
| **Speaker** | Референсный голос | WAV файл | default |
| **Model** | Обученная модель | Из списка | base |
| **Temperature** | Вариативность | 0.1 — 1.0 | 0.7 |
| **Speed** | Скорость речи | 0.5 — 2.0 | 1.0 |
| **Top-K** | Семплирование | 10 — 100 | 50 |
| **Top-P** | Nucleus sampling | 0.5 — 1.0 | 0.85 |

#### Генерация

1. Введите текст в поле ввода
2. Выберите язык (должен соответствовать языку текста!)
3. Выберите спикера (голос для клонирования)
4. Опционально: выберите дообученную модель
5. Нажмите **"Generate"**
6. Прослушайте результат во встроенном плеере
7. Скачайте аудио при необходимости

#### Загрузка своего голоса

1. Нажмите **"Upload Speaker"**
2. Выберите WAV файл (5-15 секунд чистой речи)
3. Файл появится в списке спикеров

### Settings

Страница настроек приложения.

- **Theme** — светлая/тёмная тема
- **Language** — язык интерфейса
- **API URL** — адрес Modal API
- **Cache** — очистка кэша

---

## API Reference

### Аутентификация

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"xtts2024"}'

# Response: {"success":true,"user":{"username":"admin"}}
# Cookie: auth_token=<JWT>
```

### Data Processing

```bash
# Upload files
curl -X POST http://localhost:3000/api/data/upload \
  -F "files=@audio1.wav" \
  -F "files=@audio2.wav"

# Process (Whisper)
curl -X POST http://localhost:3000/api/data/process \
  -H "Content-Type: application/json" \
  -d '{"files":["file-id-1"],"speaker_name":"my_voice","language":"ru"}'

# Get progress (SSE)
curl http://localhost:3000/api/data/progress/{jobId}

# List datasets
curl http://localhost:3000/api/data/datasets
```

### Training

```bash
# Start training
curl -X POST http://localhost:3000/api/training/start \
  -H "Content-Type: application/json" \
  -d '{
    "datasetPath": "/data/datasets/my_voice",
    "epochs": 10,
    "batchSize": 4,
    "learningRate": 5e-6
  }'

# Get progress (SSE)
curl http://localhost:3000/api/training/progress/{jobId}

# List models
curl http://localhost:3000/api/training/models
```

### Inference

```bash
# Generate speech
curl -X POST http://localhost:3000/api/inference/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Привет, это тест генерации речи!",
    "language": "ru",
    "speakerWav": "/speakers/my_voice.wav",
    "temperature": 0.7,
    "speed": 1.0
  }'

# Response:
# {"success":true,"data":{"id":"...","audioUrl":"/api/audio/....wav","duration":3.5}}

# List speakers
curl http://localhost:3000/api/inference/speakers

# Upload speaker
curl -X POST http://localhost:3000/api/inference/speakers/upload \
  -F "file=@speaker.wav"
```

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                             │
│                    http://localhost:3000                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js Application                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Pages     │  │  API Routes │  │  Middleware │              │
│  │  (React)    │  │  (Backend)  │  │   (Auth)    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Modal.com                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    FastAPI Server                        │    │
│  │              (CPU Container, always-on)                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│           │                    │                    │            │
│           ▼                    ▼                    ▼            │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐      │
│  │   Whisper   │      │  Training   │      │  Inference  │      │
│  │   Worker    │      │   Worker    │      │   Worker    │      │
│  │   (T4 GPU)  │      │  (A10G GPU) │      │   (T4 GPU)  │      │
│  └─────────────┘      └─────────────┘      └─────────────┘      │
│           │                    │                    │            │
│           └────────────────────┼────────────────────┘            │
│                                ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Modal Volumes                         │    │
│  │  xtts-finetune-data │ xtts-model-cache │ xtts-speakers  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Volumes (хранилище)

| Volume | Назначение | Содержимое |
|--------|------------|------------|
| `xtts-finetune-data` | Данные | uploads/, datasets/, models/, outputs/ |
| `xtts-model-cache` | Кэш моделей | XTTS base model, Whisper |
| `xtts-speakers` | Голоса | WAV файлы референсных голосов |

---

## Устранение неполадок

### Frontend не запускается

```bash
# Проверьте версию Node.js (нужна 18+)
node --version

# Переустановите зависимости
rm -rf node_modules package-lock.json
npm install
```

### Modal API не отвечает

```bash
# Проверьте статус Modal
modal app list

# Перезапустите serve
pkill -f "modal serve"
modal serve modal/app.py

# Проверьте логи
modal app logs xtts-webui-api
```

### Ошибка "BeamSearchScorer"

Проблема совместимости transformers. Убедитесь что в `modal/app.py` указано:
```python
"transformers>=4.36.0,<4.40.0"
```

### Ошибка "weights_only"

PyTorch 2.6+ изменил поведение. В коде должен быть патч:
```python
_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    kwargs.setdefault('weights_only', False)
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load
```

### Генерация без звука

- Проверьте что текст соответствует выбранному языку
- Убедитесь что speaker WAV файл валидный (5-15 сек, чистая речь)
- Попробуйте уменьшить temperature до 0.5

### Training не сходится (loss не уменьшается)

- Увеличьте количество данных (минимум 3 минуты аудио)
- Уменьшите learning rate (попробуйте 1e-6)
- Проверьте качество транскрипций

---

## FAQ

### Сколько данных нужно для дообучения?

**Минимум:** 3-5 минут качественного аудио
**Рекомендуется:** 10-30 минут
**Оптимально:** 1-3 часа для профессионального качества

### Какой формат аудио лучше?

- **WAV** 22050 Hz, 16-bit, mono
- Чистая речь без шума и музыки
- Сегменты по 5-15 секунд

### Сколько стоит использование Modal?

Modal предоставляет $30 бесплатных кредитов ежемесячно. Примерная стоимость:
- Whisper: ~$0.001/минута аудио
- Training: ~$0.50-2.00/час (A10G)
- Inference: ~$0.001/генерация

### Можно ли использовать свою модель?

Да! Загрузите обученную модель в volume `xtts-finetune-data/models/` и выберите её в интерфейсе.

### Поддерживается ли мультиспикер?

XTTS v2 — zero-shot voice cloning модель. Каждый запрос использует референсный WAV для клонирования голоса. Отдельного дообучения для каждого спикера не требуется для базового использования.

---

## Контакты и поддержка

- **Issues:** [GitHub Issues](https://github.com/your-repo/issues)
- **Документация Modal:** [modal.com/docs](https://modal.com/docs)
- **Coqui TTS:** [github.com/coqui-ai/TTS](https://github.com/coqui-ai/TTS)

---

*Последнее обновление: 2026-02-04*
