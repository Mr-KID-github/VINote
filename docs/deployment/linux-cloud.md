---
title: Linux 云服务器部署
description: 在 Ubuntu/Debian 云服务器上用 Docker Compose 部署 VINote，并通过 HTTPS 暴露给内测用户。
---

# Linux 云服务器部署

这套流程面向小范围内测。推荐做法是只暴露一个 HTTPS 域名，由系统级 Nginx/Caddy 终止 TLS，再转发到 VINote frontend 容器的 `3100` 端口。不要把后端 `8900` 或 Postgres 端口直接开放到公网。

## 服务器准备

推荐配置：

- Ubuntu 22.04/24.04 或 Debian 12
- 2 核 4 GB 起步；如果使用本地 STT 模型，建议更高配置
- 40 GB 以上磁盘，音视频和产物会增长
- 已解析好的域名，例如 `vinote.example.com`

安装基础依赖：

```bash
sudo apt update
sudo apt install -y git curl ca-certificates ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker compose version
```

## 获取代码

```bash
sudo mkdir -p /opt/vinote
sudo chown -R "$USER":"$USER" /opt/vinote
git clone <your-repo-url> /opt/vinote
cd /opt/vinote
```

如果是私有仓库，先配置 SSH key 或使用具有只读权限的 deploy key。

## 配置环境变量

```bash
cp deploy/cloud.env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

把生成的随机值分别填入：

- `APP_JWT_SECRET`
- `MODEL_PROFILE_ENCRYPTION_KEY`
- `POSTGRES_PASSWORD`

然后替换：

- `CORS_ALLOW_ORIGINS=https://你的域名`
- `SHARE_BASE_URL=https://你的域名`
- `LLM_API_KEY`
- `GROQ_API_KEY`，如果使用 Groq STT

内测期间如果只走 HTTP 或局域网地址，可以把 `AUTH_COOKIE_SECURE=false`，但公网 HTTPS 必须用 `true`。

## 启动应用

```bash
docker compose up -d --build
docker compose ps
```

本机检查：

```bash
curl -fsS http://127.0.0.1:8900/healthz
curl -fsS http://127.0.0.1:3100/api/auth/session
python scripts/check_reverse_proxy.py --host 127.0.0.1 --backend-port 8900 --frontend-port 3100 --docs-port 3101
```

## 配置 HTTPS 反向代理

### Nginx 示例

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

把示例里的 `vinote.example.com` 换成你的域名。

### 防火墙

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

如果是云厂商安全组，也只开放 `22`、`80`、`443`。`3100`、`8900`、`54322` 不需要对公网开放。

## 内测冒烟

1. 打开 `https://你的域名`
2. 注册一个测试用户并登录
3. 在设置页创建 LLM profile 和 STT profile，或确认 `.env` 默认 LLM/STT 可用
4. 上传一段 1-3 分钟音频生成笔记
5. 在设置页创建 API Key
6. 用 API Key 调用上传接口：

```bash
curl -X POST https://你的域名/api/v1/generate_from_upload \
  -H "Authorization: Bearer vnt_xxx" \
  -F "file=@demo.mp3" \
  -F "source_type=audio" \
  -F "summary_mode=default"
```

7. 轮询任务：

```bash
curl https://你的域名/api/v1/task/<task_id> \
  -H "Authorization: Bearer vnt_xxx"
```

## 日常运维

更新代码：

```bash
cd /opt/vinote
git pull
docker compose up -d --build --remove-orphans
python scripts/check_reverse_proxy.py --host 127.0.0.1 --backend-port 8900 --frontend-port 3100 --docs-port 3101
```

查看日志：

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

备份重点：

- Docker volume 中的 Postgres 数据
- `/opt/vinote/data`
- `/opt/vinote/output`
- `/opt/vinote/.env`

不要在日常更新中执行 `docker compose down -v`，它会删除数据库 volume。
