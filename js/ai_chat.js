/**
 * AI 智能录单 — 会话持久化 + /api/ai/chat/
 */
(function () {
  "use strict";

  const messagesEl = document.getElementById("ai-chat-messages");
  const previewPanel = document.getElementById("ai-preview-panel");
  const form = document.getElementById("ai-chat-form");
  const input = document.getElementById("ai-chat-input");
  const sendBtn = document.getElementById("ai-chat-send");
  const confirmBtn = document.getElementById("ai-chat-confirm");
  const modelSelectEl = document.getElementById("ai-model-select");
  const endpointManageBtn = document.getElementById("ai-endpoint-manage");
  const endpointModal = document.getElementById("ai-endpoint-modal");
  const endpointModalClose = document.getElementById("ai-endpoint-modal-close");
  const endpointListEl = document.getElementById("ai-endpoint-list");
  const endpointForm = document.getElementById("ai-endpoint-form");
  const endpointFormReset = document.getElementById("ai-endpoint-form-reset");
  const endpointEditId = document.getElementById("ai-endpoint-edit-id");
  const endpointNameInput = document.getElementById("ai-endpoint-name");
  const endpointBaseUrlInput = document.getElementById("ai-endpoint-base-url");
  const endpointApiKeyInput = document.getElementById("ai-endpoint-api-key");
  const endpointModelInput = document.getElementById("ai-endpoint-model");
  const endpointFormTitle = document.getElementById("ai-endpoint-form-title");
  const authStatusEl = document.getElementById("ai-auth-status");
  const githubLoginBtn = document.getElementById("ai-github-login");
  const devicePanel = document.getElementById("ai-device-panel");
  const deviceUriEl = document.getElementById("ai-device-uri");
  const deviceCodeEl = document.getElementById("ai-device-code");
  const sessionListEl = document.getElementById("ai-session-list");
  const sessionNewBtn = document.getElementById("ai-session-new");
  const sessionToggleBtn = document.getElementById("ai-session-toggle");
  const sessionSidebar = document.getElementById("ai-session-sidebar");
  const attachBtn = document.getElementById("ai-attach-btn");
  const fileInput = document.getElementById("ai-file-input");
  const attachmentStrip = document.getElementById("ai-attachment-strip");

  const rootEl = document.getElementById("ai-chat-root");
  const aiProvider = (rootEl && rootEl.dataset.provider) || "cherry";
  const aiModel = (rootEl && rootEl.dataset.aiModel) || "gpt-4o";
  const cherryUrl = (rootEl && rootEl.dataset.cherryUrl) || "http://127.0.0.1:23333";
  const initialReady = !!(rootEl && rootEl.dataset.aiReady === "1");
  const initialStatusMessage = (rootEl && rootEl.dataset.aiStatusMessage) || "";
  const authBarEl = document.getElementById("ai-auth-bar");
  const STORAGE_KEY = "ai_active_session_id";
  const STORAGE_KEY_LLM = "ai_llm_endpoint_id";

  if (!form || !messagesEl) return;

  let lastPreview = null;
  let lastParsed = null;
  let llmReady = false;
  let oauthPollTimer = null;
  let currentSessionId = null;
  let sessionsCache = [];
  let customEndpoints = [];
  let selectedLlmSource = "cherry";
  let pendingAttachments = [];

  function renderAttachmentStrip() {
    if (!attachmentStrip) return;
    if (!pendingAttachments.length) {
      attachmentStrip.classList.add("hidden");
      attachmentStrip.innerHTML = "";
      return;
    }
    attachmentStrip.classList.remove("hidden");
    attachmentStrip.innerHTML = "";
    pendingAttachments.forEach(function (att, idx) {
      const wrap = document.createElement("div");
      wrap.className = "ai-attach-thumb";
      if (att.url) {
        const img = document.createElement("img");
        img.src = att.url;
        img.alt = att.name || "附件";
        wrap.appendChild(img);
      } else {
        wrap.textContent = att.name || "上传中…";
        wrap.className += " ai-attach-thumb--pending";
      }
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "ai-attach-remove";
      rm.textContent = "×";
      rm.addEventListener("click", function () {
        pendingAttachments.splice(idx, 1);
        renderAttachmentStrip();
      });
      wrap.appendChild(rm);
      attachmentStrip.appendChild(wrap);
    });
  }

  async function apiUploadFile(file) {
    await ensureSession();
    const fd = new FormData();
    fd.append("file", file);
    if (currentSessionId) fd.append("session_id", String(currentSessionId));
    const res = await fetch("/api/ai/attachments/", {
      method: "POST",
      headers: { "X-CSRFToken": getCookie("csrftoken") },
      credentials: "same-origin",
      body: fd,
    });
    const data = await res.json().catch(function () {
      return {};
    });
    return { ok: res.ok, data: data };
  }

  async function handleImageFiles(files) {
    const list = Array.from(files || []).filter(function (f) {
      return f && f.type && f.type.startsWith("image/");
    });
    if (!list.length) {
      alert("请选择图片文件");
      return;
    }
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const { ok, data } = await apiUploadFile(file);
      if (!ok || !data.attachment) {
        alert((data.errors && data.errors[0]) || "图片上传失败");
        continue;
      }
      pendingAttachments.push(data.attachment);
    }
    renderAttachmentStrip();
  }

  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : "";
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function formatTime(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
    } catch (e) {
      return "";
    }
  }

  function clearMessagesUi() {
    messagesEl.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "ai-msg-system";
    hint.textContent =
      "可直接聊天。录单示例：张老板订了 2 台切角机 A，6 月 10 日前交货。信息齐全后我会请您点击「确认创建订单」再写入系统。";
    messagesEl.appendChild(hint);
  }

  function appendMessage(role, html) {
    const div = document.createElement("div");
    div.className =
      role === "user"
        ? "ai-msg-user"
        : role === "error"
          ? "ai-msg-error"
          : "ai-msg-assistant";
    div.innerHTML = html;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function formatPreview(preview, parsed) {
    if (!preview) return "";
    const lines = [];
    lines.push("<strong>AI 理解结果</strong>");
    if (parsed) {
      lines.push(
        '<pre class="ai-preview-json">' +
          escapeHtml(JSON.stringify(parsed, null, 2)) +
          "</pre>"
      );
    }
    const cust = preview.matches && preview.matches.customer;
    if (cust && cust.customer) {
      lines.push(
        "客户：<b>" +
          escapeHtml(cust.customer.name) +
          "</b>（" +
          escapeHtml(cust.customer.level_display || "") +
          "）"
      );
    } else if (cust && cust.candidates && cust.candidates.length) {
      lines.push("客户匹配到多条，请在对话中说明是哪一个。");
    } else if (cust && cust.needs_create) {
      lines.push("客户未找到，需先在系统中建档。");
    }
    const items = (preview.matches && preview.matches.items) || [];
    items.forEach(function (it) {
      if (it.product) {
        const stock = it.stock_sufficient === false ? " ⚠️库存不足" : " ✓库存足够";
        lines.push(
          "产品：" +
            escapeHtml(it.product.name) +
            "（" +
            escapeHtml(it.product.code) +
            "）× " +
            it.quantity +
            "，单价 ¥" +
            it.product.standard_price +
            stock
        );
      } else if (it.error) {
        lines.push("产品：" + escapeHtml(it.input || "") + " — " + escapeHtml(it.error));
      }
    });
    (preview.warnings || []).forEach(function (w) {
      lines.push('<span class="val-yellow">⚠️ ' + escapeHtml(w) + "</span>");
    });
    (preview.validation && preview.validation.errors || []).forEach(function (e) {
      lines.push('<span class="val-red">✗ ' + escapeHtml(e) + "</span>");
    });
    return lines.join("<br>");
  }

  function setLoading(loading) {
    sendBtn.disabled = loading || !llmReady;
    sendBtn.textContent = loading ? "解析中…" : "发送";
  }

  function showConfirmButton(show) {
    if (!confirmBtn) return;
    if (
      show &&
      lastPreview &&
      lastPreview.preview_id &&
      lastPreview.validation &&
      lastPreview.validation.all_valid
    ) {
      confirmBtn.classList.remove("hidden");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "确认创建订单";
    } else {
      confirmBtn.classList.add("hidden");
      confirmBtn.disabled = true;
    }
  }

  function applyPreviewFromMessage(parsed, preview) {
    lastParsed = parsed || null;
    lastPreview = preview || null;
    if (preview && preview.preview_id) {
      const html = formatPreview(preview, parsed);
      previewPanel.innerHTML = html;
      previewPanel.classList.remove("hidden");
      showConfirmButton(
        !!(preview.validation && preview.validation.all_valid)
      );
    } else {
      previewPanel.classList.add("hidden");
      showConfirmButton(false);
    }
  }

  function renderMessagesFromDb(messages) {
    clearMessagesUi();
    lastPreview = null;
    lastParsed = null;
    showConfirmButton(false);
    previewPanel.classList.add("hidden");

    (messages || []).forEach(function (m) {
      if (m.role === "user") {
        appendMessage("user", escapeHtml(m.content));
      } else if (m.role === "assistant") {
        appendMessage("assistant", escapeHtml(m.content).replace(/\n/g, "<br>"));
        if (m.preview && m.preview.preview_id) {
          applyPreviewFromMessage(m.parsed, m.preview);
        }
      }
    });
  }

  function renderSessionList() {
    if (!sessionListEl) return;
    sessionListEl.innerHTML = "";
    sessionsCache.forEach(function (s) {
      const li = document.createElement("li");
      const active = s.id === currentSessionId;
      li.className = "ai-session-item" + (active ? " active" : "");
      li.dataset.sessionId = String(s.id);

      const main = document.createElement("button");
      main.type = "button";
      main.className = "ai-session-main";
      main.innerHTML =
        '<div class="title">' +
        escapeHtml(s.title) +
        '</div><div class="meta">' +
        formatTime(s.updated_at) +
        (s.message_count ? " · " + s.message_count + " 条" : "") +
        "</div>";
      main.addEventListener("click", function () {
        selectSession(s.id);
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "del-btn";
      del.title = "删除会话";
      del.textContent = "×";
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteSession(s.id);
      });

      li.appendChild(main);
      li.appendChild(del);
      sessionListEl.appendChild(li);
    });
  }

  function saveActiveSessionId(id) {
    if (id) {
      try {
        localStorage.setItem(STORAGE_KEY, String(id));
      } catch (e) {}
    }
  }

  function readStoredSessionId() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v ? parseInt(v, 10) : null;
    } catch (e) {
      return null;
    }
  }

  async function parseJsonResponse(res) {
    const ct = (res.headers.get("Content-Type") || "").toLowerCase();
    if (ct.indexOf("application/json") === -1 && ct.indexOf("json") === -1) {
      let hint = "服务器返回非 JSON（HTTP " + res.status + "）";
      if (res.status === 404) {
        hint += "。会话接口未找到，请重启 runserver 并执行 migrate。";
      } else if (res.status === 401) {
        hint += "。请先登录系统。";
      } else if (res.status >= 500) {
        hint += "。请查看终端报错或执行 migrate。";
      }
      return { status: "error", errors: [hint] };
    }
    return res.json().catch(function () {
      return { status: "error", errors: ["响应 JSON 解析失败（HTTP " + res.status + "）"] };
    });
  }

  async function apiGet(url) {
    const res = await fetch(url, { credentials: "same-origin" });
    const data = await parseJsonResponse(res);
    return { ok: res.ok, data: data };
  }

  async function apiPost(url, body) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify(body),
    });
    const data = await parseJsonResponse(res);
    if (!res.ok && !data.errors) {
      data.errors = data.errors || [data.status || "请求失败"];
    }
    return { ok: res.ok, data: data };
  }

  async function apiPut(url, body) {
    const res = await fetch(url, {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify(body),
    });
    const data = await parseJsonResponse(res);
    return { ok: res.ok, data: data };
  }

  async function apiDelete(url) {
    const res = await fetch(url, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "X-CSRFToken": getCookie("csrftoken") },
    });
    const data = await parseJsonResponse(res);
    return { ok: res.ok, data: data };
  }

  async function loadSessions() {
    const { ok, data } = await apiGet("/api/ai/sessions/");
    if (!ok) {
      const err = (data.errors && data.errors[0]) || "无法加载会话列表";
      appendMessage("error", escapeHtml(err));
      return [];
    }
    sessionsCache = data.sessions || [];
    renderSessionList();
    return sessionsCache;
  }

  async function selectSession(id) {
    currentSessionId = id;
    saveActiveSessionId(id);
    renderSessionList();
    const { ok, data } = await apiGet("/api/ai/sessions/" + id + "/");
    if (!ok || data.status !== "ok" || !data.session) {
      appendMessage("error", escapeHtml((data.errors && data.errors[0]) || "无法加载会话。"));
      return;
    }
    renderMessagesFromDb(data.session.messages);
  }

  async function createNewSession() {
    const { ok, data } = await apiPost("/api/ai/sessions/", { title: "新对话" });
    if (!ok || !data.session) {
      appendMessage("error", (data.errors && data.errors[0]) || "无法创建会话");
      return null;
    }
    await loadSessions();
    await selectSession(data.session.id);
    return data.session.id;
  }

  async function deleteSession(id) {
    if (!confirm("确定删除该会话？")) return;
    const { ok } = await apiDelete("/api/ai/sessions/" + id + "/");
    if (!ok) {
      appendMessage("error", "删除失败");
      return;
    }
    if (currentSessionId === id) {
      currentSessionId = null;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      clearMessagesUi();
    }
    const list = await loadSessions();
    if (list.length) {
      await selectSession(list[0].id);
    } else {
      await createNewSession();
    }
  }

  async function ensureSession() {
    if (currentSessionId) return currentSessionId;
    const list = await loadSessions();
    const stored = readStoredSessionId();
    if (stored && list.some(function (s) { return s.id === stored; })) {
      await selectSession(stored);
      return currentSessionId;
    }
    if (list.length) {
      await selectSession(list[0].id);
      return currentSessionId;
    }
    return createNewSession();
  }

  async function persistAssistantMessage(content, parsed, preview) {
    if (!currentSessionId || !content) return;
    await apiPost("/api/ai/sessions/" + currentSessionId + "/messages/", {
      role: "assistant",
      content: content,
      parsed: parsed || null,
      preview: preview || null,
    });
    await loadSessions();
  }

  function readStoredLlmSource() {
    try {
      const v = localStorage.getItem(STORAGE_KEY_LLM);
      if (!v || v === "cherry") return "cherry";
      const id = parseInt(v, 10);
      return isNaN(id) ? "cherry" : id;
    } catch (e) {
      return "cherry";
    }
  }

  function saveLlmSource(source) {
    try {
      localStorage.setItem(
        STORAGE_KEY_LLM,
        source === "cherry" ? "cherry" : String(source)
      );
    } catch (e) {}
  }

  function getSelectedEndpointId() {
    return selectedLlmSource === "cherry" ? null : selectedLlmSource;
  }

  function llmStatusQuery() {
    const id = getSelectedEndpointId();
    return id ? "?llm_endpoint_id=" + encodeURIComponent(id) : "";
  }

  function populateModelSelect() {
    if (!modelSelectEl) return;
    const prev = selectedLlmSource;
    const defaultLabel =
      aiProvider === "github"
        ? "GitHub Models（" + aiModel + "）"
        : "Cherry Studio（默认）";
    modelSelectEl.innerHTML =
      '<option value="cherry">' + defaultLabel + "</option>";
    customEndpoints.forEach(function (ep) {
      const opt = document.createElement("option");
      opt.value = String(ep.id);
      opt.textContent = ep.name + " · " + ep.model_name;
      modelSelectEl.appendChild(opt);
    });
    if (prev === "cherry") {
      modelSelectEl.value = "cherry";
    } else if (customEndpoints.some(function (e) { return e.id === prev; })) {
      modelSelectEl.value = String(prev);
    } else {
      selectedLlmSource = "cherry";
      modelSelectEl.value = "cherry";
      saveLlmSource("cherry");
    }
  }

  async function loadCustomEndpoints() {
    const { ok, data } = await apiGet("/api/ai/llm-endpoints/");
    if (!ok) return;
    customEndpoints = data.endpoints || [];
    populateModelSelect();
  }

  function renderEndpointList() {
    if (!endpointListEl) return;
    if (!customEndpoints.length) {
      endpointListEl.innerHTML =
        '<li class="ai-endpoint-empty">暂无自定义配置，请在下方表单添加。</li>';
      return;
    }
    endpointListEl.innerHTML = "";
    customEndpoints.forEach(function (ep) {
      const li = document.createElement("li");
      li.className = "ai-endpoint-item";
      li.innerHTML =
        '<div class="ai-endpoint-info">' +
        '<div class="name">' +
        escapeHtml(ep.name) +
        "</div>" +
        '<div class="detail">' +
        escapeHtml(ep.base_url) +
        " · " +
        escapeHtml(ep.model_name) +
        " · " +
        escapeHtml(ep.api_key_masked || "") +
        "</div></div>";
      const actions = document.createElement("div");
      actions.className = "ai-endpoint-actions";
      const testBtn = document.createElement("button");
      testBtn.type = "button";
      testBtn.className = "sci-btn";
      testBtn.textContent = "测试";
      testBtn.addEventListener("click", function () {
        testEndpoint(ep.id);
      });
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "sci-btn";
      editBtn.textContent = "编辑";
      editBtn.addEventListener("click", function () {
        fillEndpointForm(ep);
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "sci-btn sci-btn-danger";
      delBtn.textContent = "删除";
      delBtn.addEventListener("click", function () {
        removeEndpoint(ep.id);
      });
      actions.appendChild(testBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      li.appendChild(actions);
      endpointListEl.appendChild(li);
    });
  }

  function resetEndpointForm() {
    if (endpointEditId) endpointEditId.value = "";
    if (endpointNameInput) endpointNameInput.value = "";
    if (endpointBaseUrlInput) endpointBaseUrlInput.value = "";
    if (endpointApiKeyInput) endpointApiKeyInput.value = "";
    if (endpointModelInput) endpointModelInput.value = "";
    if (endpointFormTitle) endpointFormTitle.textContent = "添加配置";
    if (endpointApiKeyInput) endpointApiKeyInput.required = true;
  }

  function fillEndpointForm(ep) {
    if (endpointEditId) endpointEditId.value = String(ep.id);
    if (endpointNameInput) endpointNameInput.value = ep.name || "";
    if (endpointBaseUrlInput) endpointBaseUrlInput.value = ep.base_url || "";
    if (endpointApiKeyInput) {
      endpointApiKeyInput.value = "";
      endpointApiKeyInput.required = false;
    }
    if (endpointModelInput) endpointModelInput.value = ep.model_name || "";
    if (endpointFormTitle) endpointFormTitle.textContent = "编辑配置";
  }

  async function testEndpoint(id) {
    const { ok, data } = await apiPost("/api/ai/llm-endpoints/" + id + "/test/", {});
    const msg = data.message || (ok ? "连接成功" : "连接失败");
    alert(msg);
    if (selectedLlmSource === id) refreshAuthStatus();
  }

  async function removeEndpoint(id) {
    if (!confirm("确定删除该自定义 API 配置？")) return;
    const { ok } = await apiDelete("/api/ai/llm-endpoints/" + id + "/");
    if (!ok) {
      alert("删除失败");
      return;
    }
    if (selectedLlmSource === id) {
      selectedLlmSource = "cherry";
      saveLlmSource("cherry");
      if (modelSelectEl) modelSelectEl.value = "cherry";
    }
    await loadCustomEndpoints();
    renderEndpointList();
    refreshAuthStatus();
  }

  function openEndpointModal() {
    endpointModal && endpointModal.classList.remove("hidden");
    renderEndpointList();
    resetEndpointForm();
  }

  function closeEndpointModal() {
    endpointModal && endpointModal.classList.add("hidden");
  }

  function setLlmUi(ready, message, statusData) {
    llmReady = ready;
    const authBar = document.getElementById("ai-auth-bar");
    if (!authStatusEl) return;
    const isCustom = selectedLlmSource !== "cherry";
    if (aiProvider === "cherry" || isCustom) {
      githubLoginBtn && githubLoginBtn.classList.add("hidden");
      devicePanel && devicePanel.classList.add("hidden");
      if (ready) {
        if (authBar) authBar.classList.add("hidden");
        if (isCustom && statusData && statusData.name) {
          authStatusEl.textContent =
            "✓ " +
            statusData.name +
            "（" +
            (statusData.model || "") +
            "）";
        } else {
          authStatusEl.textContent = "✓ Cherry Studio 已连接（" + cherryUrl + "）";
        }
        authStatusEl.className = "val-green";
        sendBtn.disabled = false;
      } else {
        if (authBar) authBar.classList.remove("hidden");
        authStatusEl.textContent = message || (isCustom
          ? "自定义 API 未就绪，请检查地址与密钥"
          : "请先启动 Cherry Studio 并开启 API 服务（端口 23333）");
        authStatusEl.className = "val-yellow";
        sendBtn.disabled = true;
      }
      return;
    }
    if (ready) {
      if (authBar) authBar.classList.add("hidden");
      authStatusEl.textContent =
        (statusData && statusData.message) ||
        "✓ 系统 GitHub Models 已就绪（全员共用，无需个人授权）";
      authStatusEl.className = "val-green";
      githubLoginBtn && githubLoginBtn.classList.add("hidden");
      devicePanel && devicePanel.classList.add("hidden");
      sendBtn.disabled = false;
    } else {
      if (authBar) authBar.classList.remove("hidden");
      const canManage = statusData && statusData.can_manage_oauth;
      authStatusEl.textContent =
        message ||
        (canManage
          ? "系统尚未配置 GitHub Models，请点击下方按钮完成一次性授权（全员共用）"
          : "系统 AI 模型尚未配置，请联系管理员完成 GitHub 授权");
      authStatusEl.className = "val-yellow";
      if (githubLoginBtn) {
        if (canManage) githubLoginBtn.classList.remove("hidden");
        else githubLoginBtn.classList.add("hidden");
      }
      sendBtn.disabled = true;
    }
  }

  async function refreshAuthStatus() {
    const { ok, data: st } = await apiGet("/api/ai/oauth/status/" + llmStatusQuery());
    if (!ok) {
      if (initialReady) return;
      return;
    }
    if (st.custom_endpoints) {
      customEndpoints = st.custom_endpoints;
      populateModelSelect();
    }
    if (selectedLlmSource !== "cherry" || aiProvider === "cherry" || st.source === "custom") {
      setLlmUi(!!st.authenticated, st.message, st);
    } else if (aiProvider === "github") {
      setLlmUi(!!st.authenticated, st.message, st);
    } else {
      setLlmUi(!!st.authenticated, st.message);
    }
  }

  async function startGithubLogin() {
    if (oauthPollTimer) clearInterval(oauthPollTimer);
    const { ok, data } = await apiPost("/api/ai/oauth/device/start/", {});
    if (!ok) {
      appendMessage("error", escapeHtml((data.errors && data.errors[0]) || "无法启动登录"));
      return;
    }
    if (devicePanel) devicePanel.classList.remove("hidden");
    if (deviceUriEl) {
      deviceUriEl.href = data.verification_uri;
      deviceUriEl.textContent = data.verification_uri;
    }
    if (deviceCodeEl) deviceCodeEl.textContent = data.user_code;
    window.open(data.verification_uri, "_blank", "noopener");

    const sessionId = data.session_id;
    const intervalMs = (data.interval || 5) * 1000;
    oauthPollTimer = setInterval(async function () {
      const poll = await apiPost("/api/ai/oauth/device/poll/", {
        session_id: sessionId,
      });
      if (poll.data.status === "ok") {
        clearInterval(oauthPollTimer);
        oauthPollTimer = null;
        appendMessage("assistant", escapeHtml(poll.data.message || "登录成功"));
        setLlmUi(true);
      } else if (poll.data.status === "error") {
        clearInterval(oauthPollTimer);
        oauthPollTimer = null;
        appendMessage("error", escapeHtml(poll.data.error || "登录失败"));
      }
    }, intervalMs);
  }

  githubLoginBtn && githubLoginBtn.addEventListener("click", startGithubLogin);
  modelSelectEl &&
    modelSelectEl.addEventListener("change", function () {
      const v = modelSelectEl.value;
      selectedLlmSource = v === "cherry" ? "cherry" : parseInt(v, 10);
      saveLlmSource(selectedLlmSource);
      refreshAuthStatus();
    });
  endpointManageBtn && endpointManageBtn.addEventListener("click", openEndpointModal);
  endpointModalClose && endpointModalClose.addEventListener("click", closeEndpointModal);
  endpointModal &&
    endpointModal.addEventListener("click", function (e) {
      if (e.target === endpointModal) closeEndpointModal();
    });
  endpointFormReset && endpointFormReset.addEventListener("click", resetEndpointForm);
  endpointForm &&
    endpointForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const editId = (endpointEditId && endpointEditId.value) || "";
      const payload = {
        name: (endpointNameInput && endpointNameInput.value) || "",
        base_url: (endpointBaseUrlInput && endpointBaseUrlInput.value) || "",
        model_name: (endpointModelInput && endpointModelInput.value) || "",
      };
      const keyVal = endpointApiKeyInput && endpointApiKeyInput.value;
      if (editId) {
        if (keyVal) payload.api_key = keyVal;
        const { ok, data } = await apiPut(
          "/api/ai/llm-endpoints/" + editId + "/",
          payload
        );
        if (!ok) {
          alert((data.errors && data.errors[0]) || "保存失败");
          return;
        }
      } else {
        if (!keyVal) {
          alert("请填写 API 密钥");
          return;
        }
        payload.api_key = keyVal;
        const { ok, data } = await apiPost("/api/ai/llm-endpoints/", payload);
        if (!ok) {
          alert((data.errors && data.errors[0]) || "保存失败");
          return;
        }
        if (data.endpoint && data.endpoint.id) {
          selectedLlmSource = data.endpoint.id;
          saveLlmSource(selectedLlmSource);
        }
      }
      resetEndpointForm();
      await loadCustomEndpoints();
      renderEndpointList();
      if (modelSelectEl && selectedLlmSource !== "cherry") {
        modelSelectEl.value = String(selectedLlmSource);
      }
      refreshAuthStatus();
    });

  sessionNewBtn && sessionNewBtn.addEventListener("click", createNewSession);
  sessionToggleBtn &&
    sessionToggleBtn.addEventListener("click", function () {
      sessionSidebar && sessionSidebar.classList.toggle("collapsed");
    });

  selectedLlmSource = readStoredLlmSource();
  if (initialReady) {
    llmReady = true;
    setLlmUi(true, initialStatusMessage, { message: initialStatusMessage });
    if (sendBtn) sendBtn.disabled = false;
  }
  loadCustomEndpoints().then(function () {
    if (modelSelectEl) {
      modelSelectEl.value =
        selectedLlmSource === "cherry" ? "cherry" : String(selectedLlmSource);
    }
    refreshAuthStatus();
  });
  ensureSession();

  attachBtn &&
    attachBtn.addEventListener("click", function () {
      fileInput && fileInput.click();
    });
  fileInput &&
    fileInput.addEventListener("change", function () {
      handleImageFiles(fileInput.files);
      fileInput.value = "";
    });
  input &&
    input.addEventListener("paste", function (e) {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      const files = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.startsWith("image/")) {
          const f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        handleImageFiles(files);
      }
    });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const text = (input.value || "").trim();
    if (!text && !pendingAttachments.length) return;

    await ensureSession();
    let userHtml = escapeHtml(text).replace(/\n/g, "<br>");
    pendingAttachments.forEach(function (att) {
      if (att.url) {
        userHtml +=
          '<br><img src="' +
          escapeHtml(att.url) +
          '" alt="" class="ai-msg-img">';
      }
    });
    appendMessage("user", userHtml);
    const attachmentIds = pendingAttachments.map(function (a) {
      return a.id;
    });
    input.value = "";
    pendingAttachments = [];
    renderAttachmentStrip();
    lastPreview = null;
    lastParsed = null;
    showConfirmButton(false);
    previewPanel.classList.add("hidden");
    setLoading(true);

    const chatBody = {
      text: text,
      session_id: currentSessionId,
    };
    if (attachmentIds.length) chatBody.attachment_ids = attachmentIds;
    const epId = getSelectedEndpointId();
    if (epId) chatBody.llm_endpoint_id = epId;

    const { ok, data } = await apiPost("/api/ai/chat/", chatBody);
    setLoading(false);

    if (data.session_id) {
      currentSessionId = data.session_id;
      saveActiveSessionId(currentSessionId);
    }

    if (!ok) {
      if (data.auth_required) {
        const msg =
          (data.errors && data.errors[0]) ||
          "AI 服务暂不可用，请联系管理员检查服务器 GitHub Models 配置。";
        setLlmUi(false, msg);
        appendMessage("error", escapeHtml(msg));
        return;
      }
      const err = (data.errors && data.errors[0]) || "请求失败";
      appendMessage("error", escapeHtml(err));
      await loadSessions();
      return;
    }

    const reply = data.reply || "";
    const mode = data.mode || "chat";

    lastParsed = data.parsed || null;
    lastPreview = data.preview || null;

    if (reply) {
      appendMessage("assistant", escapeHtml(reply).replace(/\n/g, "<br>"));
    }

    if (mode === "preview" && data.preview) {
      const html = formatPreview(data.preview, data.parsed);
      previewPanel.innerHTML = html;
      previewPanel.classList.remove("hidden");
      showConfirmButton(!!data.ready_for_confirm);
    } else {
      previewPanel.classList.add("hidden");
      showConfirmButton(false);
    }

    await loadSessions();
  });

  if (confirmBtn) {
    confirmBtn.addEventListener("click", async function () {
      if (!lastPreview || !lastPreview.preview_id) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = "提交中…";

      const body = {
        action: lastParsed.action || "create",
        preview_id: lastPreview.preview_id,
        auto_confirm: true,
        auto_create_production: true,
      };

      const { ok, data } = await apiPost("/api/ai/order/submit/", body);
      confirmBtn.textContent = "确认创建";
      showConfirmButton(false);

      if (!ok) {
        appendMessage(
          "error",
          escapeHtml((data.errors && data.errors[0]) || "提交失败")
        );
        return;
      }

      lastPreview = null;
      lastParsed = null;
      previewPanel.classList.add("hidden");

      let plainMsg = "";
      if (data.order) {
        const o = data.order;
        let msg =
          "订单已" +
          (data.action === "update" ? "更新" : "创建") +
          "：<b>" +
          escapeHtml(o.order_no) +
          "</b><br>客户：" +
          escapeHtml(o.customer) +
          "<br>状态：" +
          escapeHtml(o.status_display) +
          "<br>金额：¥" +
          o.total_amount +
          "<br>交期：" +
          escapeHtml(o.delivery_deadline);
        if (data.confirm && data.confirm.receivable_no) {
          msg += "<br>应收：" + escapeHtml(data.confirm.receivable_no);
        }
        if (data.production_tasks && data.production_tasks.length) {
          msg += "<br>已生成生产任务：" + escapeHtml(data.production_tasks.join(", "));
        }
        appendMessage("assistant", msg);
        plainMsg = msg.replace(/<[^>]+>/g, "");
      } else if (data.orders) {
        plainMsg = "查询到 " + data.orders.length + " 条订单。";
        appendMessage("assistant", plainMsg);
      } else if (data.confirmed) {
        plainMsg = "已确认 " + data.confirmed.length + " 笔订单。";
        appendMessage("assistant", plainMsg);
      }

      if (plainMsg) {
        await persistAssistantMessage(plainMsg, null, null);
      }
    });
  }
})();
