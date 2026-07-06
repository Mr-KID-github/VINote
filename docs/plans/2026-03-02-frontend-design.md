# VINote 前端设计文档

**日期**: 2026-03-02
**主题**: React 前端开发 - 团队协作笔记系统

## 1. 项目概述

**定位**: 团队协作型 AI 笔记工具，核心流程为"上传音视频 → AI 生成 Markdown 笔记 → 分享"

**技术栈**:
- 前端: React + Vite
- 后端服务: VINote (现有) + Supabase (认证+数据库)
- 部署: Vercel

## 2. 页面结构

```
┌─────────────────────────────────────────────────────────────┐
│  顶部栏: Logo | 搜索框 | 新建笔记 | 主题切换 | 用户头像    │
├────────────┬────────────────────────────────────────────────┤
│  侧边栏     │              主内容区                         │
│            │                                                │
│  - 团队空间  │  文件浏览器 / 笔记编辑区                      │
│    - 文件夹1 │                                                │
│      - 笔记  │                                                │
│  - 个人空间  │                                                │
│            │                                                │
└────────────┴────────────────────────────────────────────────┘
```

**核心页面**:
1. 登录页 - 邮箱注册/登录
2. 首页 - 文件树 + 笔记列表
3. 笔记页 - 左右分栏 (Markdown 编辑 + 预览)
4. 分享页 - 公开分享链接
5. 设置页 - 个人资料、团队管理

## 3. 功能清单

### 3.1 认证
- 邮箱 + 密码注册/登录
- 登录状态保持

### 3.2 团队管理
- 创建团队
- 邀请成员 (邮箱)
- 成员列表与角色 (admin/member)

### 3.3 文件夹管理
- 无限层级文件夹
- 新建/重命名/删除文件夹
- 拖拽移动

### 3.4 笔记管理
- 新建笔记 (空白)
- 从音视频生成笔记
- Markdown 编辑 (左侧)
- 实时预览 (右侧)
- 删除笔记

### 3.5 分享
- 生成分享链接 (公开/密码保护)
- 导出 Markdown / PDF

### 3.6 主题
- 浅色模式
- 深色模式
- 跟随系统

## 4. 数据模型 (Supabase)

```sql
-- 团队
teams: id, name, owner_id, created_at

-- 团队成员
team_members: id, team_id, user_id, role (admin/member), joined_at

-- 文件夹
folders: id, team_id, parent_id, name, created_by, created_at

-- 笔记
notes: id, folder_id, title, content,
       video_url, source_type (video/file),
       task_id, status (draft/processing/done/failed),
       created_by, created_at, updated_at

-- 分享链接
shared_links: id, note_id, token, password, expires_at, created_at
```

## 5. 视觉规范

### 浅色模式
| 元素 | 颜色 |
|------|------|
| 背景 | #FFFFFF |
| 侧边栏 | #F7F7F5 |
| 文字 | #37352F |
| 次要文字 | #9B9A97 |
| 强调色 | #2383E2 |
| 边框 | #E9E9E7 |
| 悬停 | #F1F1EF |

### 深色模式
| 元素 | 颜色 |
|------|------|
| 背景 | #191919 |
| 侧边栏 | #202020 |
| 文字 | #E3E2E0 |
| 次要文字 | #9B9A97 |
| 强调色 | #5B9AF7 |
| 边框 | #2F2F2F |
| 悬停 | #2A2A2A |

### 通用
- 圆角: 8px
- 间距网格: 8px
- 字体: Inter / -apple-system / Segoe UI
- 阴影: 0 1px 3px rgba(0,0,0,0.1)

## 6. API 对接

| 接口 | 用途 |
|------|------|
| POST /api/generate | 异步生成笔记 |
| GET /api/task/{task_id} | 查询任务状态 |
| GET /api/styles | 获取笔记风格 |
| POST /api/generate_from_upload | 上传本地媒体或文字稿并生成 |

## 7. 实施阶段

1. **Phase 1**: 项目搭建 + 认证
2. **Phase 2**: 团队管理 + 文件夹
3. **Phase 3**: 笔记生成 + 编辑器
4. **Phase 4**: 分享 + 导出
5. **Phase 5**: 主题 + 优化
