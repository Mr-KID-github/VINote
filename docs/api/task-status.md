---
title: 任务状态
description: 长任务轮询模型，以及产物读取方式。
---

# 任务状态

笔记生成是异步任务，客户端必须把轮询当成一等公民。

## 主要接口

- `GET /api/task/{task_id}`
- `GET /api/task/{task_id}/artifacts/{asset_path}`
- `GET /api/v1/task/{task_id}`，需要用户 API Key 或 `EXTERNAL_API_KEY`
- `GET /api/v1/task/{task_id}/artifacts/{asset_path}`，需要用户 API Key 或 `EXTERNAL_API_KEY`

用户创建的 API Key 只能查询该用户发起的外部任务；`.env` 管理员兜底密钥不绑定用户时可用于运维排查。

## 推荐客户端模式

1. 调 `POST /api/generate`
2. 周期性轮询任务状态
3. 成功后读取结果中的笔记和产物 URL
4. 需要时直接访问产物接口

## 常见状态

- preparing
- downloading
- transcribing
- generating
- processing screenshots
- completed
- failed
