# VINote

[English README](./README.en.md)

VINote 是一个将视频或音频内容转换为结构化 Markdown 笔记的全栈工作台。

当前版本：`v0.2.0`

当前技术栈：

- 前端：React 18 + Vite + TypeScript
- 后端：FastAPI
- 数据库：PostgreSQL
- 认证：FastAPI 签发 JWT，并通过 HttpOnly Cookie 保存会话
- 部署目标：本地 Docker 与树莓派局域网 Docker

## 核心能力

- 从视频 URL、本地音频/视频文件或本地文字稿生成结构化 Markdown 笔记，并由 VILab Server 执行下载、转写和总结
- 支持应用内简约会议录音悬浮窗，录音结束后委托 VILab Server 生成会议纪要
- 已有文字稿时直接交给 VILab Server 的文字稿流程
- 支持多种总结模式：`default`、`accurate`、`oneshot`
- 展示 VILab Server 返回的关键时刻、时间戳、截图和产物
- 保存笔记并在内置编辑器中继续修改
- 支持公开只读分享链接
- 支持配置本地或远程 VILab Server 连接
- 同时提供独立文档站与 FastAPI Swagger / ReDoc
- 文档支持中英文双语，默认中文，英文入口为 `/en/`

## 输入入口

- 浏览器生成页支持三种模式：视频 URL、本地音频/视频文件、本地文字稿
- 会议录音悬浮窗会把浏览器录音作为本地音频上传，并将结果保存为 `meeting_recording` 类型笔记
- `POST /api/generate` 处理 URL 输入
- `POST /api/generate_from_upload` 处理浏览器上传的本地音频、视频和文字稿
- 上传文字稿时支持 `TXT`、`MD`、`SRT`、`VTT`、`JSON`，并直接跳过 STT

## 文档说明

项目包含两层文档：

- 使用文档站：位于 `docs/`，由 VitePress 构建
- API 参考：由 FastAPI 自动生成 Swagger / ReDoc

文档站：

- 中文默认入口：`/`
- 英文入口：`/en/`
- 本地默认地址：`http://localhost:3101`

API 参考：

- Swagger：`http://127.0.0.1:8900/docs`
- ReDoc：`http://127.0.0.1:8900/redoc`

如果文档站和 Swagger 描述不一致，以 Swagger 为准，然后再修正文档。

## 本地开发

依赖要求：

- Python 3.10+
- Node.js 18+
- FFmpeg
- Docker Desktop 或 Docker Engine

后端：

```bash
pip install -r requirements.txt
cp .env.example .env
python main.py
```

热重载模式：

```bash
uvicorn main:app --host 0.0.0.0 --port 8900 --reload
```

前端：

```bash
cd frontend
npm install
cp .env.example .env.local
npm run web:dev
```

也可以在仓库根目录直接启动开发环境：

```bash
yarn dev         # 后端 + Tauri 桌面客户端
yarn api:dev     # 仅后端
yarn client:dev  # 仅 Tauri 桌面客户端
yarn web:dev     # 仅浏览器 Web 客户端
```

如果 `3100` 端口上已经有 VINote 的 Vite 开发服务器，桌面开发模式会直接复用它。
`yarn dev` 会自动选择已安装后端依赖的 Python；如需手动指定，可设置 `VINOTE_PYTHON=/path/to/python`。
如果 `.env` 中的本地 Postgres 暂时不可达，`yarn dev` 会仅在当前开发会话中临时改用 `data/vinote.dev.db` SQLite 数据库，不会修改 `.env`。

文档站：

```bash
cd docs
npm install
npm run docs:dev
```

Windows 一键启动：

```powershell
.\start-dev.ps1
```

## 桌面 App

桌面端基于 Tauri 2，复用现有 React/Vite 前端界面。当前桌面包不内置 FastAPI 后端、数据库或 FFmpeg；使用桌面端前需要先按本地开发或 Docker 方式启动后端服务。开发模式通过 Vite 代理访问后端，正式桌面包默认连接 `http://localhost:8900`。
会议录音入口在桌面端和 Web 端共用同一套前端流程：点击右下角 `会议录音` 按钮后会直接请求麦克风权限并开始录音。

首次开发桌面端前需要安装 Rust 工具链：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

如果本机没有 Yarn，可以先启用 Corepack：

```bash
corepack enable
```

桌面热更新开发模式：

```bash
cd frontend
yarn dev
```

等价 npm 命令：

```bash
cd frontend
npm run dev
```

生成当前系统的桌面应用包：

```bash
cd frontend
npm run desktop:build
```

Tauri 构建产物默认输出到 `frontend/src-tauri/target/release/bundle/`，macOS 默认生成 `.app` 应用包。

## Docker

启动本地容器栈：

```bash
docker compose up --build
```

会启动：

- `postgres`
- `backend`
- `frontend`
- `docs`

默认端口：

- 前端：`http://localhost:3100`
- 后端：`http://localhost:8900`
- 文档站：`http://localhost:3101`

## 树莓派部署

VINote 现在支持两条树莓派部署路径：

- 开发机手动部署
- GitHub Actions 驱动的树莓派 self-hosted runner 自动部署

### 手动部署

推荐顺序：

1. 从 `.env.example` 生成根目录 `.env`
2. 从 `deploy/pi/local.env.example` 生成 `deploy/pi/local.env`
3. 先运行 bootstrap，准备 Docker、Docker Compose 和远程应用目录
4. 再运行 deploy

Bootstrap：

```powershell
.\deploy\pi\bootstrap-pi.ps1
```

```bash
./deploy/pi/bootstrap-pi.sh
```

Deploy：

```powershell
.\deploy\pi\deploy-pi-interactive.ps1
```

```bash
./deploy/pi/deploy-pi-interactive.sh
```

```powershell
.\deploy\pi\deploy-pi.ps1
```

```bash
./deploy/pi/deploy-pi.sh
```

手动脚本继续保留，作为紧急重部署和调试时的 fallback。

### `dev` 自动部署

共享测试环境的推荐流程是：

1. PR 合并到 `dev`
2. GitHub Actions 收到 `push`
3. 树莓派 self-hosted runner 在本机 checkout 合并后的 commit
4. 树莓派直接基于当前 checkout 重建并启动服务

关键配置：

- Workflow：`.github/workflows/deploy-pi-dev.yml`
- 触发条件：`push` 到 `dev`，以及 `workflow_dispatch`
- Runner 标签：`self-hosted`、`linux`、`arm`、`pi`、`vinote-test`
- GitHub Environment：`pi-test`
- Runner 使用的本机部署脚本：`deploy/pi/deploy-from-checkout.sh`

### 树莓派一次性准备

在树莓派上完成以下初始化：

1. 安装 Docker 和 Docker Compose
2. 在独立目录中安装 GitHub Actions runner，例如 `/home/zouyu/actions-runner`
3. 注册 runner，并打上 `self-hosted,linux,arm,pi,vinote-test` 标签
4. 将 runner 安装为系统服务
5. 将 runner 用户加入 `docker` 组
6. 保持应用部署目录为 `/home/zouyu/vinote`

不要把应用目录直接拿来当 runner 工作目录。

### GitHub Environment `pi-test`

在 GitHub 中配置：

- Secret `PI_TEST_ENV_FILE`
  - 内容为树莓派测试环境使用的完整根目录 `.env`
- Variable `PI_REMOTE_DIR`
  - 默认值：`/home/zouyu/vinote`
- Variable `FRONTEND_PORT`
  - 默认值：`3100`
- Variable `BACKEND_PORT`
  - 默认值：`8900`
- Variable `DOCS_PORT`
  - 默认值：`3101`

workflow 会先把 `PI_TEST_ENV_FILE` 写入 checkout 目录中的 `.env`，然后 `deploy-from-checkout.sh` 会刷新 `/home/zouyu/vinote`，并把这份 `.env` 同步到部署目录。

### 自动部署行为

workflow 会：

1. 在树莓派 runner 上 checkout 当前触发 commit
2. 从 `PI_TEST_ENV_FILE` 写入 `.env`
3. 检查 Docker、Docker Compose、`curl` 以及 docker 组权限
4. 调用 `deploy/pi/deploy-from-checkout.sh`
5. 以 `docker compose up -d --build --remove-orphans` 重建并拉起服务
6. 对 `127.0.0.1` 上的 backend、frontend、docs 做 smoke check
7. 输出 `docker compose ps`
8. 失败时输出 backend / frontend / docs 日志

部署时会保留树莓派上的 `data/` 与 `output/` 目录。

更多树莓派部署说明见 [deploy/pi/README.md](./deploy/pi/README.md)。

## 验证建议

常用检查项：

- 文档站构建：`cd docs && npm run docs:build`
- 后端健康检查：`GET /healthz`
- Swagger：`http://127.0.0.1:8900/docs`
- 浏览器上传冒烟：分别测试 URL、本地音视频、本地文字稿三种生成入口
- 前端测试：`cd frontend && npm run test`
- 前端构建：

```bash
cd frontend
npm run build
```

## 说明

- 浏览器认证使用后端签发的 HttpOnly Cookie
- 侧边栏 `Document` 可通过 `VITE_DOCS_BASE_URL` 指向独立文档站
- 如果文档和代码不一致，以代码为准，并在同一改动中修正文档
