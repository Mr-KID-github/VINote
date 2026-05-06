import { defineConfig } from 'vitepress'

const zhTheme = {
  nav: [
    { text: '指南', link: '/guide/introduction' },
    { text: 'API', link: '/api/' },
    { text: 'MCP', link: '/integrations/mcp' },
    { text: '架构', link: '/architecture' },
    { text: 'Swagger', link: 'http://127.0.0.1:8900/docs' },
  ],
  sidebar: [
    {
      text: '使用指南',
      items: [
        { text: '介绍', link: '/guide/introduction' },
        { text: '快速开始', link: '/guide/quickstart' },
        { text: '认证', link: '/guide/authentication' },
        { text: '笔记工作流', link: '/guide/note-workflow' },
      ],
    },
    {
      text: 'API',
      items: [
        { text: '概览', link: '/api/' },
        { text: 'API Key', link: '/api/api-keys' },
        { text: '生成笔记', link: '/api/generate-note' },
        { text: '任务状态', link: '/api/task-status' },
        { text: '已保存笔记', link: '/api/saved-notes' },
      ],
    },
    {
      text: '集成',
      items: [
        { text: 'MCP 接入', link: '/integrations/mcp' },
        { text: '本地部署', link: '/deployment/local' },
        { text: 'Linux 云服务器部署', link: '/deployment/linux-cloud' },
        { text: '系统架构', link: '/architecture' },
      ],
    },
  ],
  search: {
    provider: 'local',
  },
  outline: {
    level: [2, 3],
  },
  docFooter: {
    prev: '上一页',
    next: '下一页',
  },
  footer: {
    message: '使用文档和 OpenAPI 参考文档分离维护，避免重复造轮子。',
    copyright: 'Copyright (c) VINote',
  },
}

const enTheme = {
  nav: [
    { text: 'Guide', link: '/en/guide/introduction' },
    { text: 'API', link: '/en/api/' },
    { text: 'MCP', link: '/en/integrations/mcp' },
    { text: 'Architecture', link: '/en/architecture' },
    { text: 'Swagger', link: 'http://127.0.0.1:8900/docs' },
  ],
  sidebar: [
    {
      text: 'Guide',
      items: [
        { text: 'Introduction', link: '/en/guide/introduction' },
        { text: 'Quickstart', link: '/en/guide/quickstart' },
        { text: 'Authentication', link: '/en/guide/authentication' },
        { text: 'Note Workflow', link: '/en/guide/note-workflow' },
      ],
    },
    {
      text: 'API',
      items: [
        { text: 'Overview', link: '/en/api/' },
        { text: 'API Keys', link: '/en/api/api-keys' },
        { text: 'Generate Note', link: '/en/api/generate-note' },
        { text: 'Task Status', link: '/en/api/task-status' },
        { text: 'Saved Notes', link: '/en/api/saved-notes' },
      ],
    },
    {
      text: 'Integrations',
      items: [
        { text: 'MCP Access', link: '/en/integrations/mcp' },
        { text: 'Local Deployment', link: '/en/deployment/local' },
        { text: 'Linux Cloud Deployment', link: '/en/deployment/linux-cloud' },
        { text: 'Architecture', link: '/en/architecture' },
      ],
    },
  ],
  search: {
    provider: 'local',
  },
  outline: {
    level: [2, 3],
  },
  docFooter: {
    prev: 'Previous',
    next: 'Next',
  },
  footer: {
    message: 'Usage guides and OpenAPI reference stay separate so VINote does not duplicate API reference work.',
    copyright: 'Copyright (c) VINote',
  },
}

export default defineConfig({
  title: 'VINote Docs',
  description: 'VINote product guides, integration notes, and API entry points.',
  cleanUrls: true,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]],
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      themeConfig: zhTheme,
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      themeConfig: enTheme,
    },
  },
})
