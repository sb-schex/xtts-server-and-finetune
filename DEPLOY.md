# План деплоя на сервер с GPU

## Целевая конфигурация

- **ОС:** Ubuntu 22.04 LTS Server
- **GPU:** NVIDIA RTX 3060 12GB (MSI Ventus 3x OC)
- **Проект:** XTTS Server & Fine-tune WebUI

---

## Источники для скачивания

| Компонент | Ссылка | Версия |
|-----------|--------|--------|
| **Ubuntu Server** | https://ubuntu.com/download/server | 22.04.4 LTS |
| **Ubuntu ISO (прямая)** | https://releases.ubuntu.com/22.04/ubuntu-22.04.4-live-server-amd64.iso | 2.6 GB |
| **NVIDIA Driver** | https://www.nvidia.com/Download/index.aspx | 535.x |
| **CUDA Toolkit** | https://developer.nvidia.com/cuda-12-1-0-download-archive | 12.1 |
| **cuDNN** | https://developer.nvidia.com/cudnn | 8.9.x |

---

## Архитектура деплоя

```
┌─────────────────────────────────────────────────────────────┐
│                    Ubuntu 22.04 Server                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │   Nginx     │───▶│  Next.js    │───▶│  FastAPI        │  │
│  │   :80/:443  │    │  :3000      │    │  :8000          │  │
│  │   (proxy)   │    │  (frontend) │    │  (GPU backend)  │  │
│  └─────────────┘    └─────────────┘    └─────────────────┘  │
│                                               │              │
│                                        ┌──────▼──────┐      │
│                                        │  RTX 3060   │      │
│                                        │  12GB VRAM  │      │
│                                        └─────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## Этап 0: Установка Ubuntu 22.04 LTS Server

### 0.1 Подготовка загрузочной флешки

**На Linux/Mac:**
```bash
# Скачать ISO
wget https://releases.ubuntu.com/22.04/ubuntu-22.04.4-live-server-amd64.iso

# Записать на флешку (замени /dev/sdX на свою флешку!)
# ВНИМАНИЕ: это сотрёт все данные на флешке
lsblk  # найти флешку
sudo dd if=ubuntu-22.04.4-live-server-amd64.iso of=/dev/sdX bs=4M status=progress sync
```

**На Windows:**
- Скачать [Rufus](https://rufus.ie/) или [balenaEtcher](https://etcher.balena.io/)
- Выбрать ISO файл и флешку
- Нажать "Start"

### 0.2 Установка системы

1. **Загрузка с флешки**
   - Вставить флешку в сервер
   - При загрузке нажать F2/F12/Del (зависит от материнской платы)
   - Выбрать загрузку с USB

2. **Язык и клавиатура**
   ```
   Language: English (рекомендуется для серверов)
   Keyboard: Russian или English (US)
   ```

3. **Тип установки**
   ```
   ☑ Ubuntu Server — полная установка
   ```

4. **Настройка сети**
   ```
   Рекомендуется статический IP:
   - Subnet: 192.168.1.0/24 (или ваша сеть)
   - Address: 192.168.1.100
   - Gateway: 192.168.1.1
   - DNS: 8.8.8.8, 8.8.4.4
   ```

5. **Разметка диска** (пример для NVMe 500GB)
   ```
   /boot/efi   512 MB    EFI System Partition
   /boot       1 GB      ext4
   swap        16 GB     (равно RAM или 1.5x RAM)
   /           100 GB    ext4 (система)
   /data       остаток   ext4 (данные XTTS, модели, датасеты)
   ```

6. **Профиль пользователя**
   ```
   Your name: xtts
   Server name: xtts-server
   Username: xtts
   Password: [надёжный пароль, минимум 12 символов]
   ```

7. **SSH сервер**
   ```
   ☑ Install OpenSSH server
   ☐ Import SSH identity (можно настроить позже)
   ```

8. **Дополнительные пакеты**
   ```
   Ничего не выбирать — установим вручную
   ```

9. **Завершение**
   - Дождаться установки (~10-15 минут)
   - "Remove installation medium" → извлечь флешку
   - Reboot

### 0.3 Первое подключение

```bash
# Подключиться по SSH с другого компьютера
ssh xtts@192.168.1.100

# Или если на том же компьютере — войти локально
```

---

## Этап 1: Подготовка сервера

### 1.1 Базовая настройка Ubuntu

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Базовые пакеты
sudo apt install -y build-essential git curl wget htop tmux

# Настройка SSH (если нужно)
sudo apt install -y openssh-server
sudo systemctl enable ssh

# Firewall
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 1.2 Проверка GPU в системе

```bash
# Убедиться что GPU виден системой
lspci | grep -i nvidia

# Ожидаемый вывод:
# 01:00.0 VGA compatible controller: NVIDIA Corporation GA106 [GeForce RTX 3060] (rev a1)
```

### 1.3 Установка NVIDIA драйверов

```bash
# Удалить старые драйверы (если есть)
sudo apt purge nvidia-* -y
sudo apt autoremove -y

# Перезагрузка перед установкой новых драйверов
sudo reboot
```

После перезагрузки:

```bash
# Добавить репозиторий NVIDIA
sudo add-apt-repository ppa:graphics-drivers/ppa -y
sudo apt update

# Посмотреть рекомендуемый драйвер
ubuntu-drivers devices

# Установить драйвер 535 (стабильная версия для RTX 3060)
sudo apt install -y nvidia-driver-535

# Перезагрузка для загрузки модуля драйвера
sudo reboot
```

### 1.4 Проверка драйвера

```bash
# После перезагрузки проверить
nvidia-smi

# Ожидаемый вывод:
# +-----------------------------------------------------------------------------+
# | NVIDIA-SMI 535.xx.xx    Driver Version: 535.xx.xx    CUDA Version: 12.2    |
# |-------------------------------+----------------------+----------------------+
# | GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
# | Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
# |===============================+======================+======================|
# |   0  NVIDIA GeForce RTX 3060  Off  | 00000000:01:00.0 Off |                  N/A |
# |  0%   35C    P8     9W / 170W |      0MiB / 12288MiB |      0%      Default |
# +-------------------------------+----------------------+----------------------+
```

### 1.5 Установка CUDA Toolkit 12.1

```bash
# Скачать CUDA 12.1 keyring (network installer — быстрее)
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update

# Установить CUDA 12.1 toolkit (без драйвера — он уже установлен)
sudo apt install -y cuda-toolkit-12-1

# Добавить в PATH
echo 'export PATH=/usr/local/cuda-12.1/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-12.1/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc

# Проверка версии CUDA
nvcc --version
# Ожидается: Cuda compilation tools, release 12.1, V12.1.xxx
```

### 1.6 Установка cuDNN

```bash
# cuDNN 8.9 для CUDA 12 (из репозитория NVIDIA)
sudo apt install -y libcudnn8=8.9.*-1+cuda12.1 libcudnn8-dev=8.9.*-1+cuda12.1

# Если пакет не найден, скачать вручную с NVIDIA:
# https://developer.nvidia.com/cudnn (требует регистрацию)
```

### 1.7 Тест CUDA

```bash
# Простой тест компиляции и запуска на GPU
cat > /tmp/cuda_test.cu << 'EOF'
#include <stdio.h>
__global__ void hello() { printf("Hello from GPU!\n"); }
int main() { hello<<<1,1>>>(); cudaDeviceSynchronize(); return 0; }
EOF

nvcc /tmp/cuda_test.cu -o /tmp/cuda_test && /tmp/cuda_test
# Ожидается: Hello from GPU!
```

### 1.8 Настройка Persistence Mode

```bash
# Включить persistence mode (ускоряет старт GPU операций)
sudo nvidia-smi -pm 1

# Сделать постоянным через systemd
sudo systemctl enable nvidia-persistenced
sudo systemctl start nvidia-persistenced
```

### 1.9 Итоговая проверка GPU стека

```bash
echo "=== System ===" && uname -a
echo "=== NVIDIA Driver ===" && nvidia-smi --query-gpu=driver_version --format=csv,noheader
echo "=== CUDA ===" && nvcc --version | grep release
echo "=== GPU Memory ===" && nvidia-smi --query-gpu=memory.total --format=csv,noheader
echo "=== cuDNN ===" && cat /usr/include/cudnn_version.h 2>/dev/null | grep CUDNN_MAJOR -A 2 || echo "Check: dpkg -l | grep cudnn"

# Ожидаемый результат:
# === System ===
# Linux xtts-server 5.15.0-xxx-generic ... x86_64 GNU/Linux
# === NVIDIA Driver ===
# 535.xx.xx
# === CUDA ===
# Cuda compilation tools, release 12.1
# === GPU Memory ===
# 12288 MiB
# === cuDNN ===
# #define CUDNN_MAJOR 8
```

---

## Этап 2: Установка зависимостей

### 2.1 Python 3.11

```bash
# Добавить deadsnakes PPA
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update

# Установить Python 3.11
sudo apt install -y python3.11 python3.11-venv python3.11-dev

# Сделать default (опционально)
sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1
```

### 2.2 Node.js 20 LTS

```bash
# NodeSource репозиторий
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка
node --version  # v20.x.x
npm --version
```

### 2.3 FFmpeg (для аудио)

```bash
sudo apt install -y ffmpeg libsndfile1
```

---

## Этап 3: Настройка проекта

### 3.1 Клонирование

```bash
# Создать директорию
sudo mkdir -p /opt/xtts
sudo chown $USER:$USER /opt/xtts

# Клонировать репозиторий
cd /opt/xtts
git clone https://github.com/sb-schex/xtts-server-and-finetune.git app
cd app
```

### 3.2 Backend (Python/FastAPI)

```bash
cd /opt/xtts/app

# Создать виртуальное окружение
python3.11 -m venv venv
source venv/bin/activate

# Установить PyTorch с CUDA
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Установить зависимости backend
pip install \
    fastapi>=0.109.0 \
    uvicorn>=0.27.0 \
    python-multipart>=0.0.6 \
    aiofiles>=23.2.1 \
    faster-whisper>=1.0.0 \
    TTS>=0.22.0 \
    transformers>=4.36.0,<4.40.0 \
    pydub>=0.25.1 \
    soundfile>=0.12.0 \
    scipy>=1.11.0

# Проверка CUDA
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
python -c "import torch; print(f'GPU: {torch.cuda.get_device_name(0)}')"
```

### 3.3 Frontend (Next.js)

```bash
cd /opt/xtts/app

# Установить зависимости
npm install

# Build для production
npm run build
```

### 3.4 Создать директории для данных

```bash
sudo mkdir -p /data/xtts/{uploads,datasets,models,outputs,speakers,cache}
sudo chown -R $USER:$USER /data/xtts
```

---

## Этап 4: Конфигурация

### 4.1 Environment файл

```bash
cat > /opt/xtts/app/.env.local << 'EOF'
# Auth
AUTH_USER=admin
AUTH_PASSWORD=your-secure-password-here
JWT_SECRET=generate-random-32-char-string-here

# Backend
BACKEND_URL=http://localhost:8000

# Directories
UPLOAD_DIR=/data/xtts/uploads
DATASETS_DIR=/data/xtts/datasets
MODELS_DIR=/data/xtts/models
OUTPUT_DIR=/data/xtts/outputs
SPEAKERS_DIR=/data/xtts/speakers
CACHE_DIR=/data/xtts/cache
EOF
```

### 4.2 Backend конфигурация

Создать файл `/opt/xtts/app/backend/config.py`:

```python
import os
from pathlib import Path

# Directories
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/data/xtts/uploads"))
DATASETS_DIR = Path(os.getenv("DATASETS_DIR", "/data/xtts/datasets"))
MODELS_DIR = Path(os.getenv("MODELS_DIR", "/data/xtts/models"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/data/xtts/outputs"))
SPEAKERS_DIR = Path(os.getenv("SPEAKERS_DIR", "/data/xtts/speakers"))
CACHE_DIR = Path(os.getenv("CACHE_DIR", "/data/xtts/cache"))

# Create directories
for d in [UPLOAD_DIR, DATASETS_DIR, MODELS_DIR, OUTPUT_DIR, SPEAKERS_DIR, CACHE_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# TTS settings
os.environ["COQUI_TOS_AGREED"] = "1"
os.environ["TTS_HOME"] = str(CACHE_DIR)
```

---

## Этап 5: Создание локального Backend

### 5.1 Структура

```
/opt/xtts/app/
├── backend/
│   ├── __init__.py
│   ├── config.py
│   ├── main.py          # FastAPI app
│   ├── workers/
│   │   ├── __init__.py
│   │   ├── whisper.py   # Whisper worker
│   │   ├── training.py  # Training worker
│   │   ├── inference.py # Inference worker
│   │   └── vad.py       # VAD chunking worker
│   └── routes/
│       ├── __init__.py
│       ├── data.py
│       ├── training.py
│       └── inference.py
```

### 5.2 Основной файл backend/main.py

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from .config import *
from .routes import data, training, inference

app = FastAPI(title="XTTS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router, prefix="/api/data", tags=["data"])
app.include_router(training.router, prefix="/api/training", tags=["training"])
app.include_router(inference.router, prefix="/api/inference", tags=["inference"])

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## Этап 6: Systemd сервисы

### 6.1 Backend сервис

```bash
sudo cat > /etc/systemd/system/xtts-backend.service << 'EOF'
[Unit]
Description=XTTS Backend API
After=network.target

[Service]
Type=simple
User=datasub
WorkingDirectory=/opt/xtts/app
Environment="PATH=/opt/xtts/app/venv/bin"
ExecStart=/opt/xtts/app/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

### 6.2 Frontend сервис

```bash
sudo cat > /etc/systemd/system/xtts-frontend.service << 'EOF'
[Unit]
Description=XTTS Frontend (Next.js)
After=network.target

[Service]
Type=simple
User=datasub
WorkingDirectory=/opt/xtts/app
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF
```

### 6.3 Запуск сервисов

```bash
sudo systemctl daemon-reload
sudo systemctl enable xtts-backend xtts-frontend
sudo systemctl start xtts-backend xtts-frontend

# Проверка статуса
sudo systemctl status xtts-backend
sudo systemctl status xtts-frontend
```

---

## Этап 7: Nginx reverse proxy

### 7.1 Установка Nginx

```bash
sudo apt install -y nginx
```

### 7.2 Конфигурация

```bash
sudo cat > /etc/nginx/sites-available/xtts << 'EOF'
server {
    listen 80;
    server_name your-domain.com;  # или IP адрес

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;  # Для длинных операций
    }

    # SSE endpoints
    location ~ ^/api/(data|training)/progress/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }

    # Uploads
    client_max_body_size 500M;
}
EOF

# Активировать конфиг
sudo ln -s /etc/nginx/sites-available/xtts /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Проверить и перезапустить
sudo nginx -t
sudo systemctl restart nginx
```

### 7.3 SSL (Let's Encrypt)

```bash
# Установить certbot
sudo apt install -y certbot python3-certbot-nginx

# Получить сертификат (заменить домен)
sudo certbot --nginx -d your-domain.com

# Автопродление
sudo systemctl enable certbot.timer
```

---

## Этап 8: Финальная проверка

### 8.1 Чеклист

```bash
# GPU работает
nvidia-smi

# Backend работает
curl http://localhost:8000/health

# Frontend работает
curl http://localhost:3000

# Nginx работает
curl http://localhost

# Сервисы активны
sudo systemctl status xtts-backend xtts-frontend nginx
```

### 8.2 Логи

```bash
# Backend логи
sudo journalctl -u xtts-backend -f

# Frontend логи
sudo journalctl -u xtts-frontend -f

# Nginx логи
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Этап 9: Обслуживание

### 9.1 Обновление кода

```bash
cd /opt/xtts/app
git pull
npm install
npm run build
sudo systemctl restart xtts-frontend xtts-backend
```

### 9.2 Бэкап данных

```bash
# Бэкап директории данных
tar -czvf /backup/xtts-data-$(date +%Y%m%d).tar.gz /data/xtts/
```

### 9.3 Мониторинг GPU

```bash
# Real-time мониторинг
watch -n 1 nvidia-smi

# Температура
nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader
```

---

## Статус реализации

1. [x] Создать локальный backend (вместо Modal)
   - [x] `backend/main.py`
   - [x] `backend/workers/whisper.py`
   - [x] `backend/workers/inference.py`
   - [x] `backend/workers/vad.py`
   - [x] `backend/workers/training.py`

2. [x] Обновить Next.js API routes для работы с локальным backend

3. [ ] Тестирование на сервере

4. [ ] Настройка production (systemd, nginx, SSL)

---

## Ресурсы

- [Ubuntu Server Guide](https://ubuntu.com/server/docs)
- [NVIDIA CUDA Installation](https://docs.nvidia.com/cuda/cuda-installation-guide-linux/)
- [PyTorch Installation](https://pytorch.org/get-started/locally/)
- [Coqui TTS](https://github.com/coqui-ai/TTS)
