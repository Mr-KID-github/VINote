---
title: API Key
description: 登录用户如何创建、查看和撤销自己的外部调用密钥。
---

# API Key

登录用户可以在设置页的 API Key 面板管理外部调用密钥。也可以直接调用：

- `GET /api/api-keys`
- `POST /api/api-keys`
- `DELETE /api/api-keys/{key_id}`

## 安全模型

- 完整密钥只在创建响应里返回一次
- 后端数据库只保存密钥 hash
- 列表接口只返回名称、前缀、创建时间和最近使用时间
- 撤销后密钥不能继续调用 `/api/v1`

创建的密钥用于访问 `/api/v1` 外部生成接口，并自动绑定当前用户的默认 LLM/STT 配置。
