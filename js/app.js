const $ = (sel) => document.querySelector(sel);

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

async function initApp() {
  const me = await getMe();
  $("#user-info").textContent =
    me.username + (me.groups?.length ? ` (${me.groups.join(", ")})` : "");

  try {
    await syncDjangoSession();
  } catch (e) {
    console.warn("Django session sync failed:", e);
  }

  $("#logout-btn").addEventListener("click", async () => {
    destroyDashboardCharts();
    await syncDjangoLogout();
    clearTokens();
    showLogin();
  });

  await loadDashboard();
}

function showLogin() {
  $("#login-screen").classList.remove("hidden");
  $("#app-screen").classList.add("hidden");
}

function showApp() {
  $("#login-screen").classList.add("hidden");
  $("#app-screen").classList.remove("hidden");
  $("#dashboard-content").innerHTML =
    '<div class="sci-dash"><p class="loading">正在加载数据…</p></div>';
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
      await syncDjangoSession();
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
