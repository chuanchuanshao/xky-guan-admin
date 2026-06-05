const $ = (sel) => document.querySelector(sel);

function showPage(id) {
  document.querySelectorAll(".page").forEach((el) => el.classList.add("hidden"));
  $(`#${id}`)?.classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === id);
  });
}

function fmtMoney(n) {
  return "¥" + Number(n || 0).toLocaleString("zh-CN", { minimumFractionDigits: 0 });
}

async function loadDashboard() {
  const el = $("#dashboard-content");
  el.innerHTML = '<p class="loading">加载中…</p>';
  try {
    const d = await getDashboard();
    const kpi = d.kpi || {};
    el.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-label">本月销售额</span><span class="kpi-value">${fmtMoney(kpi.month_revenue)}</span></div>
        <div class="kpi-card"><span class="kpi-label">年度营收</span><span class="kpi-value">${fmtMoney(kpi.year_revenue)}</span></div>
        <div class="kpi-card"><span class="kpi-label">生产中任务</span><span class="kpi-value">${kpi.production_active ?? 0}</span></div>
        <div class="kpi-card"><span class="kpi-label">应收余额</span><span class="kpi-value">${fmtMoney(kpi.ar_total)}</span></div>
      </div>
      <h3>订单状态分布</h3>
      <table class="data-table">
        <thead><tr><th>状态</th><th>数量</th></tr></thead>
        <tbody>
          ${(d.order_status_rows || []).map((o) => `
            <tr>
              <td>${o.label}</td>
              <td><span class="badge">${o.count}</span></td>
            </tr>
          `).join("") || "<tr><td colspan='2'>暂无数据</td></tr>"}
        </tbody>
      </table>
      <h3 style="margin-top:1.5rem">应收账款 TOP</h3>
      <table class="data-table">
        <thead><tr><th>客户</th><th>余额</th><th>状态</th></tr></thead>
        <tbody>
          ${(d.ar_rows || []).slice(0, 5).map((r) => `
            <tr>
              <td>${r.customer}</td>
              <td>${fmtMoney(r.amount)}</td>
              <td><span class="badge">${r.status_text}</span></td>
            </tr>
          `).join("") || "<tr><td colspan='3'>暂无数据</td></tr>"}
        </tbody>
      </table>`;
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

async function loadCustomers() {
  const el = $("#customers-content");
  el.innerHTML = '<p class="loading">加载中…</p>';
  try {
    const data = await getCustomers();
    const rows = data.results || [];
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>编码</th><th>名称</th><th>联系人</th><th>电话</th><th>等级</th></tr></thead>
        <tbody>
          ${rows.map((c) => `
            <tr>
              <td>${c.code || "-"}</td>
              <td>${c.name}</td>
              <td>${c.contact_person || "-"}</td>
              <td>${c.phone || "-"}</td>
              <td>${c.level}</td>
            </tr>
          `).join("") || "<tr><td colspan='5'>暂无客户</td></tr>"}
        </tbody>
      </table>
      <p class="meta">共 ${data.count ?? rows.length} 条</p>`;
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

async function loadOrders() {
  const el = $("#orders-content");
  el.innerHTML = '<p class="loading">加载中…</p>';
  try {
    const data = await getOrders();
    const rows = data.results || [];
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>订单号</th><th>客户</th><th>下单日</th><th>金额</th><th>状态</th></tr></thead>
        <tbody>
          ${rows.map((o) => `
            <tr>
              <td>${o.order_no}</td>
              <td>${o.customer_name}</td>
              <td>${o.order_date}</td>
              <td>${fmtMoney(o.total_amount)}</td>
              <td><span class="badge">${o.status_display || o.status}</span></td>
            </tr>
          `).join("") || "<tr><td colspan='5'>暂无订单</td></tr>"}
        </tbody>
      </table>
      <p class="meta">共 ${data.count ?? rows.length} 条</p>`;
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

async function loadProduction() {
  const el = $("#production-content");
  el.innerHTML = '<p class="loading">加载中…</p>';
  try {
    const data = await getProductionTasks();
    const rows = data.results || [];
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>任务号</th><th>产品</th><th>数量</th><th>状态</th><th>缺料</th></tr></thead>
        <tbody>
          ${rows.map((t) => `
            <tr>
              <td>${t.task_no}</td>
              <td>${t.product_code} ${t.product_name}</td>
              <td>${t.quantity}</td>
              <td><span class="badge">${t.status_display || t.status}</span></td>
              <td>${t.is_material_short ? "⚠ 是" : "否"}</td>
            </tr>
          `).join("") || "<tr><td colspan='5'>暂无任务</td></tr>"}
        </tbody>
      </table>
      <p class="meta">共 ${data.count ?? rows.length} 条</p>`;
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

const pageLoaders = {
  "page-dashboard": loadDashboard,
  "page-customers": loadCustomers,
  "page-orders": loadOrders,
  "page-production": loadProduction,
};

async function initApp() {
  const me = await getMe();
  $("#user-info").textContent = me.username + (me.groups?.length ? ` (${me.groups.join(", ")})` : "");

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const page = btn.dataset.page;
      showPage(page);
      const loader = pageLoaders[page];
      if (loader) await loader();
    });
  });

  $("#logout-btn").addEventListener("click", () => {
    clearTokens();
    showLogin();
  });

  showPage("page-dashboard");
  await loadDashboard();
}

function showLogin() {
  $("#login-screen").classList.remove("hidden");
  $("#app-screen").classList.add("hidden");
}

function showApp() {
  $("#login-screen").classList.add("hidden");
  $("#app-screen").classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", async () => {
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = $("#login-error");
    errEl.textContent = "";
    const username = $("#username").value.trim();
    const password = $("#password").value;
    try {
      await login(username, password);
      showApp();
      await initApp();
    } catch (err) {
      errEl.textContent = err.message || "登录失败";
    }
  });

  const { access } = getTokens();
  if (access) {
    try {
      showApp();
      await initApp();
    } catch {
      clearTokens();
      showLogin();
    }
  } else {
    showLogin();
  }
});
