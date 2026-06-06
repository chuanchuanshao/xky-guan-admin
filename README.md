# XKY 管理面板（Vercel 前端）

`guan.xkyframe.com` 的轻量管理面板，通过 API 连接腾讯云 Django 后端。

> **注意：** 这不是 Django 项目里 `templates/dashboard.html` 那套完整科研风仪表盘。
> 完整版仍在 **xkyframing.xyz**（Django 模板渲染）。本前端是方案 A 的 Vercel 独立页面。

## 登录

- 地址：https://guan.xkyframe.com
- 账号：`guan` / `XkyGuan2026`（可在服务器上修改）

## 本地开发

```bash
# 终端 1：Django API
python manage.py runserver

# 终端 2：静态页（任选）
cd frontend && python -m http.server 3000
# 浏览器打开 http://127.0.0.1:3000
```

## 部署

推送到 GitHub 后 Vercel 自动部署：

```bash
git push origin master
```

手动部署：

```bash
npx vercel --prod
```

## DNS（Cloudflare）

| 记录 | 值 |
|------|-----|
| guan | A → `76.76.21.21`（Vercel） |
| api | A → `124.221.93.94`（腾讯云） |

## 页面空白？

1. **先退出再重新登录**（清除过期 token）
2. 打开浏览器 F12 → Network，看 `/api/dashboard/` 是否报错
3. 若一直超时，检查 Clash/VPN 是否劫持 `xkyframe.com` 域名

## API 代理说明

Vercel 的 `/api/*` 会转发到腾讯云服务器 **IP**（`124.221.93.94`），不能走 `api.xkyframe.com` 域名——
海外节点访问该域名会被腾讯云备案拦截（302 到 webblock 页面），导致仪表盘无数据。
