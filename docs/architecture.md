---
title: 系统架构
description: VINote 当前运行时架构与职责边界。
---

# 系统架构

## 当前范围

VINote 目前围绕一条核心产品链路组织：

1. 用户使用系统自有账号登录。
2. 提交视频 URL 到 FastAPI 后端。
3. 后端执行笔记生成任务。
4. 生成的 Markdown 笔记保存到 PostgreSQL。
5. 用户继续在前端编辑和预览笔记。

浏览器侧当前主打 URL 工作流，虽然本地文件生成接口仍然存在于后端。

## 运行时拓扑

```text
前端 (React + Cookie Auth)
        |
        v
FastAPI 路由层
        |
        v
应用服务层
  |- AuthService
  |- NoteService
  |- ModelProfileService
  |- APIKeyService
  |- Repositories
        |
        +--> PostgreSQL
        +--> yt-dlp / ffmpeg / ffprobe
        +--> Whisper / Faster-Whisper / Groq / SenseVoice
        +--> OpenAI-compatible / Anthropic-compatible / Azure OpenAI / Ollama
        +--> output/ 任务产物
```

## 后端结构

### API 层

- `main.py`
  - 进程入口
- `app/__init__.py`
  - app factory、CORS、启动钩子、router 注册
- `app/routers/auth.py`
  - 注册、登录、退出、当前用户、会话探测接口
- `app/routers/note.py`
  - 生成和任务轮询接口
- `app/routers/note_library.py`
  - 已保存笔记 CRUD
- `app/routers/preferences.py`
  - 用户偏好接口
- `app/routers/model_profiles.py`
  - 模型配置 CRUD、连通性测试和 Ollama 模型发现
- `app/routers/api_keys.py`
  - 登录用户 API Key 创建、列表和撤销接口
- `app/routers/external_api.py`
  - API Key 保护的 `/api/v1` 外部生成和任务查询接口

### 领域与基础设施层

- `app/services/auth_service.py`
  - 密码哈希、JWT 签发/校验、HttpOnly Cookie 处理
- `app/services/api_key_*`
  - API Key 生成、hash 存储、撤销和 `/api/v1` 鉴权
- `app/services/note_service.py`
  - 笔记生成编排
- `app/services/transcription_service.py`
  - 转写器选择与转写流程
- `app/services/llm_service.py`
  - 模型解析与总结器选择
- `app/services/screenshot_service.py`
  - 截图占位符替换
- `app/services/task_artifact_service.py`
  - 输出产物与任务状态文件

## 前端结构

### App Shell

- `frontend/src/App.tsx`
  - 路由组合
- `frontend/src/components/Layout/`
  - 主框架、页头、侧栏、主题控件
- `frontend/src/components/Settings/`
  - 设置面板、模型配置和 API Key 管理 UI

### 功能页面

- `frontend/src/pages/Home.tsx`
  - 工作台首页
- `frontend/src/pages/Notes.tsx`
  - 笔记库
- `frontend/src/pages/NoteGenerator.tsx`
  - 生成流程
- `frontend/src/pages/NoteEditor.tsx`
  - Markdown 编辑与预览
- `frontend/src/pages/Settings.tsx`
  - 外观、账号和模型配置设置

## 鉴权与数据归属

- VINote 自己管理用户账户，数据存储在 PostgreSQL。
- 后端签发 JWT，并通过 HttpOnly Cookie 传递给浏览器。
- 前端不直接读取原始 token。
- 外部调用使用用户创建的 API Key 或 `.env` 兜底密钥访问 `/api/v1`。
- 用户 API Key 只在创建时返回完整值，数据库只保存 hash。
- Provider API Key 只保存在后端，前端只拿到脱敏提示。
- 任务产物仍以文件形式落在 `output/`。

## 部署形态

当前部署由三块组成：

- `frontend`
- `backend`
- `postgres`

如果启用独立文档站，还会增加一个 `docs` 静态服务。
