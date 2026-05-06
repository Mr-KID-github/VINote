---
title: Linux Cloud Deployment
description: Deploy VINote on an Ubuntu/Debian cloud server with Docker Compose and HTTPS for small private tests.
---

# Linux Cloud Deployment

This path is intended for private beta testing. Expose one HTTPS domain through a host-level Nginx or Caddy reverse proxy, and forward traffic to the VINote frontend container on port `3100`. Do not expose backend port `8900` or Postgres directly to the public internet.

## Server Preparation

Recommended baseline:

- Ubuntu 22.04/24.04 or Debian 12
- 2 CPU cores and 4 GB RAM minimum; use more if running local STT models
- 40 GB or more disk space
- a DNS name such as `vinote.example.com`

Install dependencies:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker compose version
```

## Get the Code

```bash
sudo mkdir -p /opt/vinote
sudo chown -R "$USER":"$USER" /opt/vinote
git clone <your-repo-url> /opt/vinote
cd /opt/vinote
```

For private repositories, configure an SSH key or a read-only deploy key first.

## Configure Environment

```bash
cp deploy/cloud.env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

Use strong generated values for:

- `APP_JWT_SECRET`
- `MODEL_PROFILE_ENCRYPTION_KEY`
- `POSTGRES_PASSWORD`

Then replace:

- `CORS_ALLOW_ORIGINS=https://your-domain`
- `SHARE_BASE_URL=https://your-domain`
- `LLM_API_KEY`
- `GROQ_API_KEY`, if using Groq STT

For HTTPS public testing, keep `AUTH_COOKIE_SECURE=true`. Use `false` only for HTTP-only LAN tests.

## Start the Stack

```bash
docker compose up -d --build
docker compose ps
```

Local checks:

```bash
curl -fsS http://127.0.0.1:8900/healthz
curl -fsS http://127.0.0.1:3100/api/auth/session
python scripts/check_reverse_proxy.py --host 127.0.0.1 --backend-port 8900 --frontend-port 3100 --docs-port 3101
```

## HTTPS Reverse Proxy

### Nginx Example

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/vinote >/dev/null <<'EOF'
server {
  listen 80;
  server_name vinote.example.com;

  client_max_body_size 2g;
  client_body_timeout 3600s;

  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_connect_timeout 60s;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
EOF
sudo ln -sf /etc/nginx/sites-available/vinote /etc/nginx/sites-enabled/vinote
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d vinote.example.com
```

Replace `vinote.example.com` with your real domain.

## Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Also restrict your cloud security group to `22`, `80`, and `443`. Ports `3100`, `8900`, and `54322` should stay private.

## Beta Smoke Test

1. Open `https://your-domain`
2. Register and sign in
3. Create LLM and STT profiles in Settings, or verify the `.env` defaults work
4. Upload a 1-3 minute audio file and generate a note
5. Create an API key in Settings
6. Call the upload endpoint:

```bash
curl -X POST https://your-domain/api/v1/generate_from_upload \
  -H "Authorization: Bearer vnt_xxx" \
  -F "file=@demo.mp3" \
  -F "source_type=audio" \
  -F "summary_mode=default"
```

7. Poll the task:

```bash
curl https://your-domain/api/v1/task/<task_id> \
  -H "Authorization: Bearer vnt_xxx"
```

## Operations

Update deployment:

```bash
cd /opt/vinote
git pull
docker compose up -d --build --remove-orphans
python scripts/check_reverse_proxy.py --host 127.0.0.1 --backend-port 8900 --frontend-port 3100 --docs-port 3101
```

Logs:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

Back up:

- the Postgres Docker volume
- `/opt/vinote/data`
- `/opt/vinote/output`
- `/opt/vinote/.env`

Avoid `docker compose down -v` during normal updates because it deletes the database volume.
