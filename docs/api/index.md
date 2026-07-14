---
title: API 概览
description: VINote API 的分组方式，以及文档和 Swagger 的职责边界。
---

# API 概览

VINote 暴露了多组接口。这里解释“这些接口是干什么的”，Swagger 继续解释“字段是什么”。

## 参考策略

- 这里看工作流、接口分组、调用顺序
- Swagger 看 request / response 细节

默认本地参考地址：

- Swagger UI: `http://127.0.0.1:8900/docs`
- ReDoc: `http://127.0.0.1:8900/redoc`

## 路由分组

- Auth
  - 注册、登录、退出、当前用户、会话探测
- Generation
  - 发起笔记生成任务
- Tasks
  - 轮询任务状态、拉取任务产物
- Notes
  - 保存笔记 CRUD 和分享链路
- Preferences
  - 用户级偏好配置
- VILab Server
  - 本地或远程 VILab Server 连接配置与连通性测试
- Public Share
  - 公开只读分享页
- MCP
  - 通过 HTTP JSON-RPC 暴露的 MCP 接口
