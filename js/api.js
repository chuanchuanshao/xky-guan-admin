/**
 * XKY 管理面板 — API 客户端
 * 生产环境 API 地址：https://api.xkyframe.com/api
 */
const API_BASE = (() => {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://127.0.0.1:8000/api";
  }
  // Vercel 生产：走同源 /api 代理（vercel.json → 腾讯云后端），避免跨域和混合内容
  if (host.endsWith(".vercel.app") || host === "guan.xkyframe.com") {
    return "/api";
  }
  return "https://api.xkyframe.com/api";
})();

function getTokens() {
  return {
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
  };
}

function setTokens(access, refresh) {
  if (access) localStorage.setItem("access_token", access);
  if (refresh) localStorage.setItem("refresh_token", refresh);
}

function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

async function refreshAccessToken() {
  const { refresh } = getTokens();
  if (!refresh) return false;
  const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  setTokens(data.access, data.refresh || refresh);
  return true;
}

/** JWT 是否即将过期（提前 2 分钟刷新） */
function isAccessTokenStale(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000 - 120000;
  } catch {
    return true;
  }
}

/** 进入 SPA 前确保 access token 可用，避免闪回登录页 */
async function ensureAccessToken() {
  const { access, refresh } = getTokens();
  if (!access && !refresh) return false;
  if (access && !isAccessTokenStale(access)) return true;
  if (refresh) return refreshAccessToken();
  return !!access;
}

async function api(path, options = {}) {
  const { access } = getTokens();
  const headers = {
    "Content-Type": "application/json",
    ...(access ? { Authorization: `Bearer ${access}` } : {}),
    ...options.headers,
  };

  const timeoutMs = options.timeoutMs || 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error("请求超时，请检查网络或稍后重试");
    }
    throw new Error("网络错误，无法连接后端 API");
  }
  clearTimeout(timer);

  if (res.status === 401 && access) {
    const ok = await refreshAccessToken();
    if (ok) {
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${getTokens().access}`,
      };
      res = await fetch(`${API_BASE}${path}`, { ...options, headers: retryHeaders, credentials: "include" });
    }
  }

  if (res.status === 401) {
    throw new Error("登录已过期，请重新登录");
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }

  if (!res.ok) {
    const msg = data?.detail || data?.message || `请求失败 (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

async function login(username, password) {
  const data = await api("/auth/token/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setTokens(data.access, data.refresh);
  return data;
}

async function getMe() {
  return api("/auth/me/");
}

async function getDashboard() {
  return api("/dashboard/");
}

async function getCustomers(page = 1) {
  return api(`/customers/?page=${page}`);
}

async function getOrders(page = 1, status = "") {
  const q = status ? `&status=${encodeURIComponent(status)}` : "";
  return api(`/orders/?page=${page}${q}`);
}

async function getProductionTasks(page = 1) {
  return api(`/production/tasks/?page=${page}`);
}

/** 同步 Django Session，使 /orders/、/ai/chat/ 等完整页面可访问 */
async function syncDjangoSession() {
  return api("/auth/django-session/", { method: "POST", body: "{}" });
}

async function syncDjangoLogout() {
  try {
    await api("/auth/django-logout/", { method: "POST", body: "{}" });
  } catch {
    /* ignore */
  }
}
