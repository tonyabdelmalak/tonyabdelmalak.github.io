// Chat Widget — /chat-widget/assets/chat/widget.js
// Floating chat widget for Tony's site using a Cloudflare Worker backend.
//
// What’s included (safe, production-ready):
// - Preserves cw-* CSS class names (keeps your current styling intact)
// - Adds kbUrl support (about-tony.md) alongside systemUrl
// - Reads finish_reason to show a "Continue" chip for long answers
// - Sends BOTH shapes: {messages:[...]} AND legacy {message/system/history/context}
// - Optional localStorage history
// - Optional custom hooks (analytics, typing indicators, error logging, etc.)
//
// You can use as-is. No other edits required.

// ===================== Config & State =====================

var DEFAULT_CONFIG = {
  workerUrl: "https://my-chat-agent.tonyabdelmalak.workers.dev/chat",
  systemUrl: "/chat-widget/assets/chat/system.md",
  // NEW: Knowledge base URL used by the Worker to merge bio/portfolio facts
  kbUrl: "/chat-widget/assets/chat/about-tony.md",

  model: "llama-3.1-8b-instant",
  temperature: 0.2,

  title: "What's on your mind?",
  greeting: "",

  brand: { accent: "#3e5494", radius: "14px" },

  // Behavior
  maxHistory: 16,               // messages to include in payload
  persistHistory: true,         // store conversation across reloads
  storageKey: "cw_history",     // localStorage key
  ariaLabel: "Tony chat widget",

  // Starter topics for the empty state
  topics: [
    { title: "Projects & dashboards", body: "What did you build at Quibi and Flowserve?" },
    { title: "Career pivot", body: "How did you move from HR into analytics and AI?" },
    { title: "People analytics", body: "Show examples of attrition or onboarding insights." },
    { title: "AI copilots", body: "How do your chat assistants help leaders decide faster?" }
  ],

  // Optional hooks (all nullable). Pass functions via TonyChatWidget.init({ hooks: {...} })
  hooks: {
    onInit:        null, // ({config})
    onOpen:        null, // ()
    onClose:       null, // ()
    onSend:        null, // ({text, history})
    onContinue:    null, // ()
    onResponse:    null, // ({content, finishReason, history})
    onError:       null, // ({error})
    onTypingStart: null, // ()
    onTypingEnd:   null  // ()
  }
};

var CONFIG = null;              // filled by init
var HISTORY = [];               // [{role, content}]
var BUSY = false;

var CW_ROOT = null;             // widget root
var CW_PANE = null;             // messages scroll container
var CW_FORM = null;             // form
var CW_INPUT = null;            // textarea
var CW_SEND = null;             // send button
var CONTINUE_VISIBLE = false;   // only one continue chip at a time

// ===================== Utilities =====================

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

function nowISO() { try { return new Date().toISOString(); } catch(_) { return ""; } }

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
  if (!CW_PANE) return;
  CW_PANE.scrollTop = CW_PANE.scrollHeight + 999;
}

// ===================== Public Init API =====================

window.TonyChatWidget = {
  init: function init(opts) {
    CONFIG = shallowMerge(DEFAULT_CONFIG, opts || {});

    HISTORY = CONFIG.persistHistory ? (lsGet(CONFIG.storageKey, []) || []) : [];
    if (!Array.isArray(HISTORY)) HISTORY = [];

    buildUI();

    // (Optional) Hook: onInit
    try { CONFIG.hooks && CONFIG.hooks.onInit && CONFIG.hooks.onInit({ config: CONFIG }); } catch(_){}

    if (CONFIG.greeting) {
      addMsg("assistant", CONFIG.greeting, { meta: true });
    } else {
      renderTopics();
    }

    // restore visible history
    if (HISTORY.length) {
      for (var i=0;i<HISTORY.length;i++) {
        addMsg(HISTORY[i].role, HISTORY[i].content, { restoring:true });
      }
      scrollToBottom();
    }
  }
};

// ===================== UI =====================

function buildUI() {
  // Root wrapper
  CW_ROOT = document.createElement("section");
  CW_ROOT.id = "cw";
  CW_ROOT.className = "cw-root";
  CW_ROOT.setAttribute("role", "dialog");
  CW_ROOT.setAttribute("aria-label", CONFIG.ariaLabel);
  document.body.appendChild(CW_ROOT);

  // Header
  var hdr = document.createElement("header");
  hdr.className = "cw-header";
  hdr.innerHTML = `
    <div class="cw-title" id="cw-title">${esc(CONFIG.title || "Chat")}</div>
    <button class="cw-close" id="cw-close" type="button" aria-label="Close chat" title="Close">×</button>
  `;
  CW_ROOT.appendChild(hdr);

  // open/close hooks (open fires the first time the widget renders)
  try { CONFIG.hooks && CONFIG.hooks.onOpen && CONFIG.hooks.onOpen(); } catch(_){}
  document.getElementById("cw-close").addEventListener("click", function(){
    CW_ROOT.style.display="none";
    try { CONFIG.hooks && CONFIG.hooks.onClose && CONFIG.hooks.onClose(); } catch(_){}
  });

  // Messages pane
  CW_PANE = document.createElement("div");
  CW_PANE.id = "cw-messages";
  CW_PANE.className = "cw-messages";
  CW_PANE.setAttribute("role", "log");
  CW_PANE.setAttribute("aria-live", "polite");
  CW_ROOT.appendChild(CW_PANE);

  // Form
  CW_FORM = document.createElement("form");
  CW_FORM.className = "cw-form";
  CW_FORM.setAttribute("novalidate","novalidate");
  CW_FORM.innerHTML = `
    <label for="cw-input" class="cw-visually-hidden">Type your message</label>
    <textarea id="cw-input" class="cw-input" rows="1" placeholder="Type a message…" autocomplete="off"></textarea>
    <button class="cw-send" id="cw-send" type="submit" aria-label="Send message" title="Send">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
           width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
      </svg>
    </button>
  `;
  CW_ROOT.appendChild(CW_FORM);

  CW_INPUT = CW_FORM.querySelector("#cw-input");
  CW_SEND  = CW_FORM.querySelector("#cw-send");

  CW_FORM.addEventListener("submit", onSubmit);
  CW_INPUT.addEventListener("input", function(){ autoGrowTextarea(CW_INPUT, 1); });
  CW_INPUT.addEventListener("keydown", function(e){
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      CW_SEND.click();
    }
  });

  autoGrowTextarea(CW_INPUT, 1);
}

// ===================== Topics =====================

function renderTopics() {
  if (!CONFIG.topics || !CONFIG.topics.length) return;
  // Remove if already present
  var old = CW_PANE.querySelector(".cw-topics");
  if (old) old.remove();

  var box = document.createElement("div");
  box.className = "cw-topics";

  var title = document.createElement("div");
  title.className = "cw-topics-title";
  title.textContent = "Try one of these:";
  box.appendChild(title);

  var list = document.createElement("div");
  list.className = "cw-topics-list";

  CONFIG.topics.forEach(function(t){
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cw-topic";
    b.setAttribute("aria-label", t.title);
    b.textContent = t.title;
    b.addEventListener("click", function(){
      CW_INPUT.value = t.body || t.title;
      autoGrowTextarea(CW_INPUT, 1);
      CW_SEND.click();
      box.remove();
    });
    list.appendChild(b);
  });

  box.appendChild(list);
  CW_PANE.appendChild(box);
}

// ===================== Messages =====================

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
  CW_PANE.appendChild(row);

  if (opts.continueChip) {
    addContinueChip(bubble);
  }

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
    try { CONFIG.hooks && CONFIG.hooks.onContinue && CONFIG.hooks.onContinue(); } catch(_){}
    sendMessage("continue");
  });
  bubbleEl.appendChild(document.createElement("br"));
  bubbleEl.appendChild(chip);
  CONTINUE_VISIBLE = true;
}

function removeAssistantPlaceholderIfAny() {
  var nodes = CW_PANE.querySelectorAll(".cw-row-assistant .cw-content");
  if (!nodes || !nodes.length) return;
  var last = nodes[nodes.length - 1];
  if (last && last.textContent === "…") {
    var bubble = last.closest(".cw-bubble");
    var row = bubble && bubble.closest(".cw-row");
    if (row && row.parentNode) row.parentNode.removeChild(row);
  }
}

// ===================== History =====================

function pushHistory(role, content) {
  HISTORY.push({ role: role, content: content });
  if (HISTORY.length > CONFIG.maxHistory) {
    HISTORY = HISTORY.slice(-CONFIG.maxHistory);
  }
  if (CONFIG.persistHistory) lsSet(CONFIG.storageKey, HISTORY);
}

// ===================== Send Flow =====================

async function onSubmit(e) {
  e.preventDefault();
  if (BUSY) return;

  var text = (CW_INPUT.value || "").trim();
  if (!text) return;

  // Hook: onSend (can throw to block submits)
  try { CONFIG.hooks && CONFIG.hooks.onSend && CONFIG.hooks.onSend({ text, history: HISTORY.slice() }); } catch (hookErr) {
    // If a hook intentionally throws, stop submit; also surface optional error hook.
    try { CONFIG.hooks && CONFIG.hooks.onError && CONFIG.hooks.onError({ error: hookErr }); } catch(_){}
    return;
  }

  CW_INPUT.value = "";
  autoGrowTextarea(CW_INPUT, 1);

  // Clear topics if still visible
  var topics = CW_PANE.querySelector(".cw-topics");
  if (topics) topics.remove();

  addMsg("user", text);
  pushHistory("user", text);
  await sendToWorker(text);
}

async function sendMessage(text) {
  if (BUSY) return;
  text = String(text || "").trim();
  if (!text) return;
  // Hook: onSend for explicit calls too
  try { CONFIG.hooks && CONFIG.hooks.onSend && CONFIG.hooks.onSend({ text, history: HISTORY.slice() }); } catch (hookErr) {
    try { CONFIG.hooks && CONFIG.hooks.onError && CONFIG.hooks.onError({ error: hookErr }); } catch(_){}
    return;
  }
  addMsg("user", text);
  pushHistory("user", text);
  await sendToWorker(text);
}

async function sendToWorker(text) {
  BUSY = true;

  // assistant thinking placeholder + typing hook
  addMsg("assistant", "…", { meta: true });
  try { CONFIG.hooks && CONFIG.hooks.onTypingStart && CONFIG.hooks.onTypingStart(); } catch(_){}

  // Build payload (dual shape for safety)
  var absoluteSystem = toAbsolute(CONFIG.systemUrl);
  var absoluteKb     = toAbsolute(CONFIG.kbUrl);

  var payload = {
    // NEW preferred shape used by your Worker:
    messages: HISTORY.map(function(m){ return { role: m.role, content: m.content }; }),
    model: CONFIG.model,
    temperature: CONFIG.temperature,
    systemUrl: absoluteSystem,
    kbUrl: absoluteKb,

    // Legacy fields (kept for compatibility with earlier worker variants)
    message: text,
    system: absoluteSystem,                 // some workers expected the raw system string or URL
    history: HISTORY.slice(-CONFIG.maxHistory),
    context: { persona: "__TONY_PERSONA__", sources: "__TONY_SOURCES__", creative_mode: true }
  };

  try {
    var res = await resilientFetch(CONFIG.workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    var data = await res.json();

    // typing end hook
    try { CONFIG.hooks && CONFIG.hooks.onTypingEnd && CONFIG.hooks.onTypingEnd(); } catch(_){}

    removeAssistantPlaceholderIfAny();

    if (data && data.error) {
      var errMsg = "Oops, something went wrong: " + (data.error.message || data.error || "Unknown error");
      addMsg("assistant", errMsg);
      pushHistory("assistant", errMsg);
      try { CONFIG.hooks && CONFIG.hooks.onError && CONFIG.hooks.onError({ error: data.error }); } catch(_){}
      BUSY = false;
      return;
    }

    var content = (data && typeof data.content === "string") ? data.content : "";
    var finish  = (data && typeof data.finish_reason === "string") ? data.finish_reason : "stop";

    addMsg("assistant", content, { continueChip: finish !== "stop" });
    pushHistory("assistant", content);

    try { CONFIG.hooks && CONFIG.hooks.onResponse && CONFIG.hooks.onResponse({ content, finishReason: finish, history: HISTORY.slice() }); } catch(_){}
  } catch (err) {
    removeAssistantPlaceholderIfAny();
    try { CONFIG.hooks && CONFIG.hooks.onTypingEnd && CONFIG.hooks.onTypingEnd(); } catch(_){}
    var em = "Network error. Please try again.";
    addMsg("assistant", em);
    pushHistory("assistant", em);
    try { CONFIG.hooks && CONFIG.hooks.onError && CONFIG.hooks.onError({ error: err }); } catch(_){}
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

// ===================== Optional: Minimal inline styles =====================
//
// If your site already styles .cw-* classes, you can ignore this block.
// If you want safe defaults (lighter grays, send icon inherits color), uncomment.

/*
;(function injectStyles(){
  var css = `
.cw-root{position:fixed;right:20px;bottom:20px;width:360px;max-width:92vw;background:#fff;border:1px solid #e7e7ea;border-radius:${esc(DEFAULT_CONFIG.brand.radius)};box-shadow:0 14px 36px rgba(0,0,0,.14);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;z-index:2147483647}
.cw-header{display:flex;align-items:center;justify-content:space-between;background:#f1f1f2;border-bottom:1px solid #e7e7ea;padding:10px 12px}
.cw-title{font-weight:700}
.cw-close{border:0;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#666}
.cw-messages{height:380px;overflow-y:auto;padding:12px;background:#fafafa}
.cw-row{display:flex;margin:6px 0}
.cw-row-user{justify-content:flex-end}
.cw-row-assistant{justify-content:flex-start}
.cw-bubble{max-width:86%;border:1px solid #e7e7ea;border-radius:14px;padding:10px 12px;background:#fff}
.cw-bubble-user{background:#f6f6f7}
.cw-bubble-assistant{background:#fff}
.cw-content{white-space:pre-wrap;word-wrap:break-word}
.cw-time{display:block;margin-top:6px;color:#777;font-size:11px}
.cw-form{display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px;border-top:1px solid #e7e7ea;background:#fff}
.cw-input{width:100%;min-height:38px;max-height:120px;resize:none;border:1px solid #e7e7ea;background:#fff;border-radius:12px;padding:10px 12px;outline:none}
.cw-send{border:0;padding:0 14px;border-radius:12px;background:${esc(DEFAULT_CONFIG.brand.accent)};color:#fff;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.cw-send svg{opacity:.85} /* lighter gray look via opacity; fill=currentColor */
.cw-topics{background:#fff;border:1px dashed #e7e7ea;border-radius:12px;padding:10px 12px;margin-bottom:8px}
.cw-topics-title{font-weight:600;margin-bottom:8px}
.cw-topics-list{display:flex;flex-wrap:wrap;gap:8px}
.cw-topic{border:1px solid #e7e7ea;background:#f6f6f7;color:#111;border-radius:999px;padding:6px 10px;cursor:pointer}
.cw-continue{margin-top:6px;border:1px solid #e7e7ea;background:transparent;color:#111;border-radius:999px;padding:6px 10px;cursor:pointer}
.cw-visually-hidden{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`;
  var style = document.createElement("style");
  style.setAttribute("data-cw","inline");
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
})();
*/
// ===== Auto-init safeguard (adds itself if your page doesn't call init) =====
(function () {
  if (window.__CW_AUTO_INIT_DONE__) return;
  window.__CW_AUTO_INIT_DONE__ = true;

  function boot() {
    try {
      // If you normally pass options, put them here:
      // e.g., { greeting: "Hi! Ask me about my dashboards." }
      window.TonyChatWidget && window.TonyChatWidget.init({});
    } catch (e) {
      // last-ditch retry if other scripts weren’t ready yet
      setTimeout(function(){ window.TonyChatWidget && window.TonyChatWidget.init({}); }, 300);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();


// ===================== End of File =====================
