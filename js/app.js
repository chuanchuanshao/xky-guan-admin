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

function setupRegistrationNav(me) {
  const regNav = $("#nav-registrations");
  const badge = $("#nav-reg-badge");
  const banner = $("#reg-pending-banner");
  const bannerText = $("#reg-pending-text");
  const bannerLink = $("#reg-pending-link");
  const canReview = !!me.can_review_registrations;
  const pending = me.pending_registration_count || 0;

  if (!canReview) return;

  if (regNav) {
    regNav.classList.remove("hidden");
    regNav.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await syncDjangoSession();
        window.location.href = regNav.href;
      } catch (err) {
        alert("无法打开审批页，请重新登录后再试。");
      }
    });
  }

  if (badge && pending > 0) {
    badge.textContent = pending > 99 ? "99+" : String(pending);
    badge.classList.remove("hidden");
  }

  if (banner && pending > 0) {
    bannerText.textContent = `有 ${pending} 条用户注册待审批`;
    banner.classList.remove("hidden");
    if (bannerLink) {
      bannerLink.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await syncDjangoSession();
          window.location.href = bannerLink.href;
        } catch (err) {
          alert("无法打开审批页，请重新登录后再试。");
        }
      });
    }
  }
}

async function initApp() {
  const me = await getMe();
  $("#user-info").textContent =
    me.username + (me.groups?.length ? ` (${me.groups.join(", ")})` : "");

  setupRegistrationNav(me);

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
