# XKY 管理面板（已废弃独立 SPA）

> **2026-06 起**：`frontend/index.html` 已改为重定向到 Django 首页 `/`。  
> 经营总览、订单、财务等全部使用 **Django 模板**（`templates/` + `static/css/dashboard_sci.css`）。

## 推荐部署方式

| 环境 | 说明 |
|------|------|
| **本地** | `python manage.py runserver` → http://127.0.0.1:8000/ |
| **线上** | Nginx 将 `guan.xkyframe.com` 全部反代到 Django（不再单独托管 Vercel SPA） |

登录使用 Django 标准 Session（`/accounts/login/`），无需 JWT 桥接。

## 登录

- https://guan.xkyframe.com
- `guan` / `XkyGuan2026`

## 历史说明（旧混合架构，仅供参考）

此前 Vercel 托管 SPA 仪表盘 + 代理 Django 业务页。现已统一为 Django 单体，保留本目录仅为兼容旧部署路径的重定向。

## 部署

后端变更同步到服务器：`scripts/deploy_from_local.ps1`
