// Chat Widget — /chat-widget/assets/chat/widget.js
// Architecture: ensureMount() → loadConfig() → applyTheme() → fetchSystem() → buildShell()
// Preserves cw-* CSS classes, restores visible launcher, adds kbUrl + Continue chip,
// sends both modern {messages:[]} AND legacy fields, and auto-inits safely.

/* ===================== Config & State ===================== */

var DEFAULT_CONFIG = {
  workerUrl: "https://my-chat-agent.tonyabdelmalak.workers.dev/chat",
  systemUrl: "/chat-widget/assets/chat/system.md",
  // NEW: bio/portfolio knowledge (merged by Worker with system.md)
  kbUrl: "/chat-widget/assets/chat/about-tony.md",

  model: "llama-3.1-8b-instant",
  temperature: 0.2,

  title: "What's on your mind?",
  greeting: "",

  brand: { accent: "#3e5494", radius: "14px" },

  // Operational
  maxHistory: 16,
  persistHistory: true,
  storageKey: "cw_history",

  // Starter topics shown in empty state
  topics: [
    { title: "Projects & dashboards", body: "What did you build at Quibi and Flowserve?" },
    { title: "Career pivot", body: "How did you move from HR into analytics and AI?" },
    { title: "People analytics", body: "Show examples of attrition or onboarding insights." },
    { title: "AI copilots", body: "How do your chat assistants help leaders decide faster?" }
  ]
};

// Safe globals for older code paths that referenced these
var __TONY_PERSONA__  = (typeof __TONY_PERSONA__  !== "undefined") ? __TONY_PERSONA__  : {};
var __TONY_SOURCES__  = (typeof __TONY_SOURCES__  !== "undefined") ? __TONY_SOURCES__  : [];
var TONY_AVATAR_URL   = "/chat-widget/assets/chat/avatar.png";

var CONFIG = null;
var HISTORY = [];
var BUSY = false;
var CONTINUE_VISIBLE = false;

// UI refs
var ui = {
  root: null,
  launcher: null,
  panel: null,
  head: null,
  messages: null,
  form: null,
  input: null,
  send: null,
  close: null
};

/* ===================== Utilities ===================== */

function shallowMerge(a, b) {
  var out = {};
  a = a || {}; b = b || {};
  for (var k in a) out[k] = a[k];
  for (var k2 in b) out[k2] = b[k2];
  return out;
}

function toAbsolute(pathOrUrl) {
  try { return new URL(pathOrUrl, window.location.origin).href; }
  catch (_) { return pathOrUrl; }
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function lsGet(k, fallback) {
  try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : fallback; } catch(_){ return fallback; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch(_){}
}

function autoGrowTextarea(el, minRows) {
  el.rows = minRows;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function scrollToBottom() {
  if (!ui.messages) return;
  ui.messages.scrollTop = ui.messages.scrollHeight + 999;
}

function nowISO() { try { return new Date().toISOString(); } catch(_) { return ""; } }

/* ===================== Mount & Config ===================== */

function ensureMount() {
  // Root wrapper (kept consistent with your cw-* architecture)
  var root = document.getElementById("cw");
  if (!root) {
    root = document.createElement("section");
    root.id = "cw";
    root.className = "cw-root";
    document.body.appendChild(root);
  }
  ui.root = root;

  // Launcher (VISIBLE again)
  var launcher = document.getElementById("cw-launcher");
  if (!launcher) {
    launcher = document.createElement("div");
    launcher.id = "cw-launcher";
    launcher.className = "cw-launcher";
    root.appendChild(launcher);
  }
  ui.launcher = launcher;

  // Panel (chat window)
  var panel = document.getElementById("cw-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "cw-panel";
    panel.className = "cw-panel";
    root.appendChild(panel);
  }
  ui.panel = panel;

  // Basic default styles in case site CSS is missing (non-invasive)
  if (!document.querySelector('style[data-cw-defaults]')) {
    var css = `
.cw-root{position:fixed;right:20px;bottom:20px;z-index:2147483647}
.cw-launcher{position:absolute;right:0;bottom:0}
.cw-launcher-btn{border:0;background:transparent;cursor:pointer;padding:0}
.cw-launcher .cw-avatar{width:54px;height:54px;border-radius:50%;box-shadow:0 8px 22px rgba(0,0,0,.18);border:1px solid rgba(0,0,0,.08);display:block}
.cw-panel{display:none;position:absolute;right:64px;bottom:0;width:360px;max-width:92vw;background:#fff;border:1px solid #e7e7ea;border-radius:${esc(DEFAULT_CONFIG.brand.radius)};box-shadow:0 14px 36px rgba(0,0,0,.14);overflow:hidden}
.cw-header{display:flex;align-items:center;justify-content:space-between;background:#f1f1f2;border-bottom:1px solid #e7e7ea;padding:10px 12px}
.cw-title{font:600 14px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.cw-close{border:0;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#666}
.cw-messages{height:380px;overflow-y:auto;padding:12px;background:#fafafa}
.cw-row{display:flex;margin:6px 0}
.cw-row-user{justify-content:flex-end}
.cw-row-assistant{justify-content:flex-start}
.cw-bubble{max-width:86%;border:1px solid #e7e7ea;border-radius:14px;padding:10px 12px;background:#fff}
.cw-bubble-user{background:#f6f6f7}
.cw-content{white-space:pre-wrap;word-wrap:break-word}
.cw-time{display:block;margin-top:6px;color:#777;font-size:11px}
.cw-form{display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px;border-top:1px solid #e7e7ea;background:#fff}
.cw-input{width:100%;min-height:38px;max-height:120px;resize:none;border:1px solid #e7e7ea;background:#fff;border-radius:12px;padding:10px 12px;outline:none}
.cw-send{border:0;padding:0 14px;border-radius:12px;background:${esc(DEFAULT_CONFIG.brand.accent)};color:#fff;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.cw-send svg{opacity:.85}
.cw-topics{background:#fff;border:1px dashed #e7e7ea;border-radius:12px;padding:10px 12px;margin-bottom:8px}
.cw-topics-title{font-weight:600;margin-bottom:8px}
.cw-topics-list{display:flex;flex-wrap:wrap;gap:8px}
.cw-topic{border:1px solid #e7e7ea;background:#f6f6f7;color:#111;border-radius:999px;padding:6px 10px;cursor:pointer}
.cw-continue{margin-top:6px;border:1px solid #e7e7ea;background:transparent;color:#111;border-radius:999px;padding:6px 10px;cursor:pointer}
.cw-visually-hidden{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`;
    var style = document.createElement("style");
    style.setAttribute("data-cw-defaults","true");
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }
}

function loadConfig() {
  // Merge defaults with any global config (backward compatible)
  var pageCfg = (typeof window.TonyChatConfig === "object" && window.TonyChatConfig) ? window.TonyChatConfig : {};
  var cfg = shallowMerge(DEFAULT_CONFIG, pageCfg);

  // Ensure kbUrl is present
  cfg.kbUrl = cfg.kbUrl || "/chat-widget/assets/chat/about-tony.md";

  // Optionally try a config.json (non-blocking)
  // If you prefer not to fetch, you can safely remove this block.
  return Promise.resolve(cfg);
}

function applyTheme(cfg) {
  // Apply accent/radius via CSS variables if root exists
  if (!ui.panel) return;
  ui.panel.style.borderRadius = cfg.brand.radius || "14px";
}

/* ===================== Data Fetchers ===================== */

function fetchSystem(systemUrl) {
  // Old code path expected the raw system string. We still fetch it,
  // but even if it fails we’ll send systemUrl + kbUrl so Worker can fetch.
  if (!systemUrl) return Promise.resolve("");
  var abs = toAbsolute(systemUrl);
  return fetch(abs, { redirect: "follow" })
    .then(function(r){ return r.ok ? r.text() : ""; })
    .catch(function(){ return ""; });
}

/* ===================== UI Shell ===================== */

function buildShell(cfg, system) {
  // 1) Launcher (visible)
  ui.launcher.innerHTML = `
    <button class="cw-launcher-btn" type="button" aria-label="Open chat" title="Chat">
      <img class="cw-avatar" src="${esc(cfg.avatarUrl || TONY_AVATAR_URL)}" alt="Tony" />
    </button>
  `;
  ui.launcher.addEventListener("click", function () {
    ui.panel.style.display = (ui.panel.style.display === "block") ? "none" : "block";
    if (ui.panel.style.display === "block") scrollToBottom();
  });

  // 2) Panel contents
  ui.panel.innerHTML = `
    <header class="cw-header">
      <div class="cw-title">${esc(cfg.title || "Chat")}</div>
      <button class="cw-close" id="cw-close" type="button" aria-label="Close chat" title="Close">×</button>
    </header>
    <div class="cw-messages" id="cw-messages" role="log" aria-live="polite"></div>
    <form class="cw-form" id="cw-form" novalidate>
      <label for="cw-input" class="cw-visually-hidden">Type your message</label>
      <textarea id="cw-input" class="cw-input" rows="1" placeholder="Type a message…" autocomplete="off"></textarea>
      <button class="cw-send" id="cw-send" type="submit" aria-label="Send message" title="Send">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
             width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
          <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
        </svg>
      </button>
    </form>
  `;

  ui.head = ui.panel.querySelector(".cw-header");
  ui.messages = ui.panel.querySelector("#cw-messages");
  ui.form = ui.panel.querySelector("#cw-form");
  ui.input = ui.panel.querySelector("#cw-input");
  ui.send = ui.panel.querySelector("#cw-send");
  ui.close = ui.panel.querySelector("#cw-close");

  applyTheme(cfg);

  // Close button
  ui.close.addEventListener("click", function(){
    ui.panel.style.display = "none";
  });

  // Greeting or topics
  if (cfg.greeting) {
    addMsg("assistant", cfg.greeting, { meta: true });
  } else {
    renderTopics(cfg);
  }

  // Restore persisted conversation
  if (cfg.persistHistory) {
    HISTORY = lsGet(cfg.storageKey, []) || [];
    if (!Array.isArray(HISTORY)) HISTORY = [];
    if (HISTORY.length) {
      for (var i=0;i<HISTORY.length;i++) addMsg(HISTORY[i].role, HISTORY[i].content, { restoring:true });
      scrollToBottom();
    }
  }

  // Input behaviors
  ui.input.addEventListener("input", function(){ autoGrowTextarea(ui.input, 1); });
  ui.input.addEventListener("keydown", function(e){
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ui.send.click();
    }
  });
  autoGrowTextarea(ui.input, 1);

  // Submit handler
  ui.form.addEventListener("submit", function(e){
    e.preventDefault();
    if (BUSY) return;

    var text = (ui.input.value || "").trim();
    if (!text) return;

    ui.input.value = "";
    autoGrowTextarea(ui.input, 1);

    // Clear topics if present
    var box = ui.messages.querySelector(".cw-topics");
    if (box) box.remove();

    addMsg("user", text);
    pushHistory("user", text, cfg);
    sendToWorker(cfg, system, text);
  });
}

/* ===================== Messages & History ===================== */

function renderTopics(cfg) {
  if (!cfg.topics || !cfg.topics.length) return;
  var box = document.createElement("div");
  box.className = "cw-topics";

  var title = document.createElement("div");
  title.className = "cw-topics-title";
  title.textContent = "Try one of these:";
  box.appendChild(title);

  var list = document.createElement("div");
  list.className = "cw-topics-list";

  cfg.topics.forEach(function(t){
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cw-topic";
    b.setAttribute("aria-label", t.title);
    b.textContent = t.title;
    b.addEventListener("click", function(){
      ui.input.value = t.body || t.title;
      autoGrowTextarea(ui.input, 1);
      ui.send.click();
      box.remove();
    });
    list.appendChild(b);
  });

  box.appendChild(list);
  ui.messages.appendChild(box);
}

function addMsg(role, content, opts) {
  opts = opts || {};
  var row = document.createElement("div");
  row.className = "cw-row " + (role === "user" ? "cw-row-user" : "cw-row-assistant");

  var bubble = document.createElement("div");
  bubble.className = "cw-bubble " + (role === "user" ? "cw-bubble-user" : "cw-bubble-assistant");

  var t = nowISO();
  var stamp = opts.meta || opts.restoring ? "" :
      `<time class="cw-time" datetime="${esc(t)}">${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</time>`;

  bubble.innerHTML = `<div class="cw-content">${esc(content)}</div>${stamp}`;
  row.appendChild(bubble);
  ui.messages.appendChild(row);

  if (opts.continueChip) addContinueChip(bubble);

  if (!opts.restoring) scrollToBottom();
}

function addContinueChip(bubbleEl) {
  if (CONTINUE_VISIBLE) return;
  var chip = document.createElement("button");
  chip.type = "button";
  chip.className = "cw-continue";
  chip.textContent = "Continue";
  chip.addEventListener("click", function(){
    CONTINUE_VISIBLE = false;
    chip.disabled = true;
    chip.textContent = "Continuing…";
    // Send a lightweight continuation token
    addMsg("user", "continue");
    pushHistory("user", "continue", CONFIG);
    sendToWorker(CONFIG, "", "continue"); // system string not needed for continuation
  });
  bubbleEl.appendChild(document.createElement("br"));
  bubbleEl.appendChild(chip);
  CONTINUE_VISIBLE = true;
}

function pushHistory(role, content, cfg) {
  HISTORY.push({ role: role, content: content });
  if (HISTORY.length > cfg.maxHistory) HISTORY = HISTORY.slice(-cfg.maxHistory);
  if (cfg.persistHistory) lsSet(cfg.storageKey, HISTORY);
}

function popAssistantPlaceholderIfAny() {
  var nodes = ui.messages.querySelectorAll(".cw-row-assistant .cw-content");
  if (!nodes || !nodes.length) return;
  var last = nodes[nodes.length - 1];
  if (last && last.textContent === "…") {
    var bubble = last.closest(".cw-bubble");
    var row = bubble && bubble.closest(".cw-row");
    if (row && row.parentNode) row.parentNode.removeChild(row);
  }
}

/* ===================== Network ===================== */

async function sendToWorker(cfg, systemRaw, text) {
  BUSY = true;

  // Assistant typing placeholder
  addMsg("assistant", "…", { meta: true });

  var absoluteSystem = toAbsolute(cfg.systemUrl);
  var absoluteKb     = toAbsolute(cfg.kbUrl);

  // Dual payload (modern + legacy) for backward compatibility
  var payload = {
    // Modern, Worker-friendly
    messages: HISTORY.map(function(m){ return { role: m.role, content: m.content }; }),
    model: cfg.model,
    temperature: cfg.temperature,
    systemUrl: absoluteSystem,
    kbUrl: absoluteKb,

    // Legacy fields (some earlier Workers expected these)
    message: text,
    system: systemRaw, // keep sending the raw system string if we have it
    history: HISTORY.slice(-cfg.maxHistory),
    context: { persona: __TONY_PERSONA__, sources: __TONY_SOURCES__, creative_mode: true }
  };

  try {
    var res = await resilientFetch(cfg.workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    var data = await res.json();
    popAssistantPlaceholderIfAny();

    if (data && data.error) {
      var errMsg = "Oops, something went wrong: " + (data.error.message || data.error || "Unknown error");
      addMsg("assistant", errMsg);
      pushHistory("assistant", errMsg, cfg);
      BUSY = false;
      return;
    }

    var content = (data && typeof data.content === "string") ? data.content : "";
    var finish  = (data && typeof data.finish_reason === "string") ? data.finish_reason : "stop";

    addMsg("assistant", content, { continueChip: finish !== "stop" });
    pushHistory("assistant", content, cfg);
  } catch (err) {
    popAssistantPlaceholderIfAny();
    var em = "Network error. Please try again.";
    addMsg("assistant", em);
    pushHistory("assistant", em, cfg);
  } finally {
    BUSY = false;
    scrollToBottom();
  }
}

async function resilientFetch(url, opts, retries, backoff) {
  retries = retries == null ? 1 : retries;
  backoff = backoff == null ? 700 : backoff;

  try {
    var r = await fetch(url, opts);
    if (!r.ok) {
      if (retries > 0 && (r.status === 429 || r.status >= 500)) {
        await new Promise(function(res){ setTimeout(res, backoff); });
        return resilientFetch(url, opts, retries - 1, backoff * 2);
      }
      return r;
    }
    return r;
  } catch(e) {
    if (retries > 0) {
      await new Promise(function(res){ setTimeout(res, backoff); });
      return resilientFetch(url, opts, retries - 1, backoff * 2);
    }
    throw e;
  }
}

/* ===================== Boot ===================== */

function boot() {
  ensureMount();
  loadConfig().then(function (cfg) {
    CONFIG = cfg;
    // Build panel immediately (so UI shows even if fetches are slow)
    buildShell(cfg, "");
    // Fetch system text in the background (old path support)
    return fetchSystem(cfg.systemUrl).then(function (system) {
      // Overwrite shell with system-aware handlers (keeps UI; listeners already bound)
      // We don't need to rebuild UI; just keep system string for next sends:
      // We store it on the ui object for convenience:
      ui.__systemString = system;
    });
  }).catch(function(){
    // As a fallback, at least keep a visible launcher + basic panel
    // (Already built in buildShell with empty system)
  });
}

/* ===================== Public API (for manual init if desired) ===================== */

window.TonyChatWidget = {
  init: function init(opts) {
    DEFAULT_CONFIG = shallowMerge(DEFAULT_CONFIG, opts || {});
    boot();
  }
};

/* ===================== Auto-init safeguard ===================== */

(function () {
  if (window.__CW_AUTO_INIT_DONE__) return;
  window.__CW_AUTO_INIT_DONE__ = true;

  function start() {
    try {
      // If a page-level config exists, loadConfig merges it. Otherwise DEFAULT_CONFIG is used.
      boot();
    } catch (e) {
      // Retry once if other scripts weren’t ready yet
      setTimeout(function(){ boot(); }, 300);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
