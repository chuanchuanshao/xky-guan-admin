# XKY 管理面板（Vercel + Django 混合）

`guan.xkyframe.com` 采用 **混合架构**：

| 部分 | 说明 |
|------|------|
| **经营总览**（首页 `/`） | Vercel 白底 SPA + Chart.js，与本地 Django 仪表盘一致 |
| **订单 / AI / 生产 / 财务…** | 同域名代理到腾讯云 **完整 Django 页面**（增删改、AI 录单全功能） |

登录一次即可：Vercel 登录后会自动同步 Django Session（`/api/auth/django-session/`），侧边栏点「订单管理」「AI 录单」等即进入完整业务系统。

## 登录

- https://guan.xkyframe.com
- `guan` / `XkyGuan2026`

## 架构

```
浏览器 → guan.xkyframe.com (Vercel)
           ├─ /              → 静态 SPA（仪表盘）
           ├─ /css /js       → Vercel 静态资源
           ├─ /api/*         → 腾讯云 Django API
           └─ /orders/* /ai/* … → 腾讯云 Django 完整 HTML 页面
```

## 部署

```bash
git push origin master   # Vercel 自动部署前端
# 后端变更需同步到腾讯云（见项目 scripts/deploy_from_local.ps1）
```
