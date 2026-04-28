---
title: 认证
description: VINote 的会话模型，以及受保护接口如何访问。
---

# 认证

VINote 使用后端签发的 JWT Session Cookie。

## 认证模型

- 用户对 FastAPI 认证接口进行登录或注册
- 登录成功后，后端设置 HttpOnly Cookie
- 浏览器或 API 客户端访问受保护接口时必须携带该 Cookie
- 前端不直接读取原始 Token

## 主要接口

- `POST /api/auth/sign-up`
- `POST /api/auth/sign-in`
- `POST /api/auth/sign-out`
- `GET /api/auth/session`
- `GET /api/auth/me`

## 实践建议

- 浏览器端统一使用 `credentials: include`
- 前端初始化可优先调用 `GET /api/auth/session`，避免未登录状态产生无意义 401
- 脚本或 CLI 客户端要自己持久化 Cookie
- 如果部署在局域网，检查 `.env` 里的 Cookie 域名和安全配置

## 外部 API Key

后端也提供 `/api/v1` 外部接口。登录用户可以在设置页创建自己的 API Key，也可以调用：

- `GET /api/api-keys`
- `POST /api/api-keys`
- `DELETE /api/api-keys/{key_id}`

完整密钥只会在创建时返回一次，数据库只保存 hash。调用方可以通过 `Authorization: Bearer <key>` 或 `X-API-Key: <key>` 访问 URL 生成、上传生成和任务查询接口。

`.env` 中的 `EXTERNAL_API_KEY` 仍可作为管理员级兜底密钥。`EXTERNAL_API_USER_ID` 只影响这个兜底密钥；设置后，外部接口会以该用户身份解析默认 LLM/STT 配置，并允许传入该用户可访问的 `model_profile_id`、`stt_profile_id`。
