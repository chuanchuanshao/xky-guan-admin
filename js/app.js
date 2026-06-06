const $ = (sel) => document.querySelector(sel);

const PAGE_TITLES = {
  "page-dashboard": "经营总览",
  "page-orders": "订单管理",
  "page-customers": "客户管理",
  "page-production": "生产任务",
};

function showPage(id) {
  document.querySelectorAll(".page").forEach((el) => el.classList.add("hidden"));
  $(`#${id}`)?.classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === id);
  });
  const titleEl = $("#page-title");
  if (titleEl) {
    titleEl.textContent = PAGE_TITLES[id] || "管理面板";
  }
}

function fmtMoney(n) {
  return "¥" + Number(n || 0).toLocaleString("zh-CN", { minimumFractionDigits: 0 });
}

async function loadDashboard() {
  const el = $("#dashboard-content");
  el.innerHTML = '<div class="sci-dash"><p class="loading">加载中…</p></div>';
  try {
    destroyDashboardCharts();
    const d = await getDashboard();
    renderDashboard(d, el);
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

function listPageShell(title, inner) {
  return `
    <div class="sci-dash sci-dash-sub">
      <div class="sci-card">
        <div class="sci-card-head">
          <span class="sci-title">${title}</span>
        </div>
        ${inner}
      </div>
    </div>`;
}

async function loadCustomers() {
  const el = $("#customers-content");
  el.innerHTML = listPageShell("客户列表", '<p class="loading">加载中…</p>');
  try {
    const data = await getCustomers();
    const rows = data.results || [];
    const table = `
      <table class="sci-table">
        <thead><tr><th>编码</th><th>名称</th><th>联系人</th><th>电话</th><th>等级</th></tr></thead>
        <tbody>
          ${rows.map((c) => `
            <tr>
              <td class="name-cell">${c.code || "-"}</td>
              <td class="name-cell">${c.name}</td>
              <td>${c.contact_person || "-"}</td>
              <td>${c.phone || "-"}</td>
              <td>${c.level}</td>
            </tr>
          `).join("") || "<tr><td colspan='5' class='name-cell'>暂无客户</td></tr>"}
        </tbody>
      </table>
      <p class="meta">共 ${data.count ?? rows.length} 条</p>`;
    el.innerHTML = listPageShell("客户列表", table);
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

async function loadOrders() {
  const el = $("#orders-content");
  el.innerHTML = listPageShell("订单列表", '<p class="loading">加载中…</p>');
  try {
    const data = await getOrders();
    const rows = data.results || [];
    const table = `
      <table class="sci-table">
        <thead><tr><th>订单号</th><th>客户</th><th>下单日</th><th>金额</th><th>状态</th></tr></thead>
        <tbody>
          ${rows.map((o) => `
            <tr>
              <td>${o.order_no}</td>
              <td class="name-cell">${o.customer_name}</td>
              <td>${o.order_date}</td>
              <td class="val-blue">${fmtMoney(o.total_amount)}</td>
              <td>${o.status_display || o.status}</td>
            </tr>
          `).join("") || "<tr><td colspan='5' class='name-cell'>暂无订单</td></tr>"}
        </tbody>
      </table>
      <p class="meta">共 ${data.count ?? rows.length} 条</p>`;
    el.innerHTML = listPageShell("订单列表", table);
  } catch (e) {
    el.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

async function loadProduction() {
  const el = $("#production-content");
  el.innerHTML = listPageShell("生产任务", '<p class="loading">加载中…</p>');
  try {
    const data = await getProductionTasks();
    const rows = data.results || [];
    const table = `
      <table class="sci-table">
        <thead><tr><th>任务号</th><th>产品</th><th>数量</th><th>状态</th><th>缺料</th></tr></thead>
        <tbody>
          ${rows.map((t) => `
            <tr>
              <td>${t.task_no}</td>
              <td class="name-cell">${t.product_code} ${t.product_name}</td>
              <td>${t.quantity}</td>
              <td>${t.status_display || t.status}</td>
              <td>${t.is_material_short ? "⚠ 是" : "否"}</td>
            </tr>
          `).join("") || "<tr><td colspan='5' class='name-cell'>暂无任务</td></tr>"}
        </tbody>
      </table>
      <p class="meta">共 ${data.count ?? rows.length} 条</p>`;
    el.innerHTML = listPageShell("生产任务", table);
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
    destroyDashboardCharts();
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
  $("#dashboard-content").innerHTML = '<div class="sci-dash"><p class="loading">正在加载数据…</p></div>';
}

async function bootstrapApp() {
  await getMe();
  showApp();
  await initApp();
}

document.addEventListener("DOMContentLoaded", async () => {
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = $("#login-error");
    errEl.textContent = "";
    const username = $("#username").value.trim();
    const password = $("#password").value;
    try {
      errEl.textContent = "登录中…";
      await login(username, password);
      errEl.textContent = "";
      await bootstrapApp();
    } catch (err) {
      errEl.textContent = err.message || "登录失败";
    }
  });

  const { access } = getTokens();
  if (access) {
    try {
      await bootstrapApp();
    } catch (err) {
      clearTokens();
      showLogin();
      $("#login-error").textContent = err.message || "会话已失效，请重新登录";
    }
  } else {
    showLogin();
  }
});
