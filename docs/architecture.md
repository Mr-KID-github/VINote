---
title: 系统架构
description: VINote 当前运行时架构与职责边界。
---

# 系统架构

## 当前范围

VINote 目前围绕一条核心产品链路组织：

1. 用户使用系统自有账号登录。
2. 提交视频 URL 到 FastAPI 后端。
3. 后端把笔记生成任务提交给 VILab Server。
4. 生成的 Markdown 笔记保存到 PostgreSQL。
5. 用户继续在前端编辑和预览笔记。

浏览器侧支持 URL、本地媒体和本地文字稿入口；VINote 负责提交和展示，VILab Server 负责实际流水线。

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
  |- VILabServerConnectionService
  |- Repositories
        |
        +--> PostgreSQL
        +--> VILab Server
        +--> output/ 代理产物与已保存媒体
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
- `app/routers/vilab_server.py`
  - VILab Server 连接配置和连通性测试

### 领域与基础设施层

- `app/services/auth_service.py`
  - 密码哈希、JWT 签发/校验、HttpOnly Cookie 处理
- `app/services/note_service.py`
  - VILab Server 笔记生成适配
- `app/services/vilab_server_client.py`
  - VILab Server HTTP 客户端
- `app/services/vilab_server_connection_service.py`
  - 用户级 VILab Server 连接解析和测试
- `app/services/task_artifact_service.py`
  - 输出产物与任务状态文件

## 前端结构

### App Shell

- `frontend/src/App.tsx`
  - 路由组合
- `frontend/src/components/Layout/`
  - 主框架、页头、侧栏、主题控件
- `frontend/src/components/Settings/`
  - 设置面板和 VILab Server 连接 UI

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
- VILab Server API Key 只保存在后端，前端只拿到脱敏提示。
- VINote 保存并代理 VILab Server 返回的任务产物。

## 部署形态

当前部署由三块组成：

- `frontend`
- `backend`
- `postgres`

如果启用独立文档站，还会增加一个 `docs` 静态服务。
