---
title: 笔记工作流
description: 从 URL、本地音视频或文字稿到可编辑 Markdown 笔记的完整生命周期。
---

# 笔记工作流

## 输入模式

- 视频 URL：VINote 提交给 VILab Server，由服务端负责下载、转写和总结
- 本地音频 / 视频：浏览器通过 `multipart/form-data` 上传媒体文件，再由 VILab Server 处理
- 本地文字稿：浏览器上传 `TXT`、`MD`、`SRT`、`VTT`、`JSON`，并提交给 VILab Server 的文字稿流程

## 生命周期

1. 客户端提交 URL、本地音视频或文字稿生成请求
2. VINote 后端把请求代理给已配置的 VILab Server
3. VILab Server 执行下载、转写、总结和产物生成
4. VINote 轮询 VILab Server 任务状态并代理任务产物
5. 前端展示关键时刻、时间戳、截图和媒体产物
6. 持久化任务产物并更新状态
7. 前端将最终笔记保存到数据库

## 总结模式

- `default`
- 使用 VILab Server 的默认总结策略
- `accurate`
- 使用 VILab Server 的精准总结策略
- `oneshot`
- 使用 VILab Server 的一次型总结策略

## 用户体验上的结果

- 浏览器生成器支持 URL、本地音视频、本地文字稿三种入口
- 笔记标题可带时间戳跳转
- 关键时刻可以附带截图
- 预览侧媒体可跟随时间戳 seek
- 保存后的笔记可以生成公开只读分享链接
