---
title: 生成笔记
description: 如何创建 URL 或上传驱动的笔记生成任务，以及后续应如何处理。
---

# 生成笔记

## 常用异步接口

- `POST /api/generate`
- `POST /api/generate_from_upload`

## 常用同步接口

- `POST /api/generate_sync`
- `POST /api/generate_from_upload_sync`

## 对外 API Key 接口

登录用户可以在设置页创建自己的 API Key，也可以调用 `POST /api/api-keys` 创建。创建响应里的完整密钥只返回一次，后续列表只显示前缀。

使用 API Key 后，可以调用受保护的 `/api/v1` 入口：

- `POST /api/v1/generate`
- `POST /api/v1/generate_sync`
- `POST /api/v1/generate_from_upload`
- `POST /api/v1/generate_from_upload_sync`
- `GET /api/v1/task/{task_id}`
- `GET /api/v1/task/{task_id}/artifacts/{asset_path}`

调用时使用 `Authorization: Bearer <API_KEY>`，也可以使用 `X-API-Key: <API_KEY>`。用户创建的 API Key 会自动绑定该用户，并使用该用户的默认 LLM/STT 配置。

`.env` 中的 `EXTERNAL_API_KEY` 仍可作为管理员级兜底密钥；如果这类密钥需要使用某个用户的默认 LLM/STT 配置或指定 `model_profile_id`、`stt_profile_id`，同时设置 `EXTERNAL_API_USER_ID` 为该用户 ID。

## 这组接口解决什么问题

它负责把 URL、本地音视频或本地文字稿变成一个任务，而不是立刻返回最终笔记。

## 输入方式

- URL 输入走 JSON 请求体，使用 `POST /api/generate`
- 本地音视频走 `multipart/form-data`，使用 `POST /api/generate_from_upload`，并传 `source_type=audio` 或 `source_type=video`
- 本地文字稿同样走 `multipart/form-data`，传 `source_type=transcript`，后端会直接跳过 STT

## 调用后的下一步

1. 从响应里拿到 `task_id`
2. 去轮询任务状态
3. 任务完成后保存或读取笔记记录

字段细节、可选参数和 schema 一律看 Swagger。
