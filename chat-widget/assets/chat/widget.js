// Chat Widget — /chat-widget/assets/chat/widget.js
// Vanilla JS floating chat that talks to your Cloudflare Worker.
// SAFETY-FIRST BUILD: retains common patterns (config/init/UI/history) while adding:
// - kbUrl support (about-tony.md merged by the Worker)
// - finish_reason handling (shows a "Continue" chip)
// - graceful network errors & retries
// - optional localStorage history
// - accessible controls (labels, roles)
// - lighter gray visual defaults; send icon uses currentColor
//
// Replace your existing file with this one. If you have site-level CSS, it still applies.
// You can tune look/feel via CSS classes at the bottom of this file or your stylesheet.

// ===================== Config & State =====================

var DEFAULT_CONFIG = {
  workerUrl: "https://my-chat-agent.tonyabdelmalak.workers.dev/chat",
  systemUrl: "/chat-widget/assets/chat/system.md",
  // NEW: Knowledge base URL (about-tony.md)
  kbUrl: "/chat-widget/assets/chat/about-tony.md",

  model: "llama-3.1-8b-instant",
  temperature: 0.2,

  title: "What's on your mind?",
  greeting: "",

  // Branding tokens used by this file only if no external CSS overrides them.
  brand: { accent: "#3e5494", radius: "14px" },

  // Behavior
  maxHistory: 16,            // last N turns to send to the worker
  persistHistory: true,      // keep a light copy in localStorage
  storageKey: "tcw_history", // ls key

  // UI toggles
  showTopics: true,          // show "starter chips" on empty state
  topics: [
    { title: "Projects & dashboards", body: "What did you build at Quibi and Flowserve?" },
    { title: "Career pivot", body: "How did you move from HR into analytics and AI?" },
    { title: "People analytics", body: "Show me examples of attrition or onboarding insights." },
    { title: "AI copilots", body: "How do your chat assistants help leaders decide faster?" }
  ],

  // Accessibility
  ariaLabel: "Tony chat widget"
};

// Global config (populated via init)
var CONFIG = null;

// Chat state
var HISTORY = [];               // array of {role, content}
var BUSY = false;               // sending in progress
var ROOT = null;                // widget root element
var PANE = null;                // message scroll container
var INPUT = null;               // textarea input
var FORM = null;                // form element
var SEND_BTN = null;            // send button
var CONTINUE_ACTIVE = false;    // whether "Continue" chip is present

// ===================== Small Utilities =====================

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

function isString(x) { return typeof x === "string"; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function lsGet(k, fallback) {
  try {
    var s = localStorage.getItem(k);
    return s ? JSON.parse(s) : fallback;
  } catch (_e) {
    return fallback;
  }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (_e) {}
}

function autoGrowTextarea(el, minRows) {
  el.rows = minRows;
  var h = el.scrollHeight;
  el.style.height = "auto";
  el.style.height = h + "px";
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nowISO() {
  try { return new Date().toISOString(); } catch (_) { return ""; }
}

// Debounce util
function debounce(fn, ms) {
  var t = null;
  return function () {
    var self = this, args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

// ===================== Public Init API =====================

window.TonyChatWidget = {
  /**
   * Initialize chat widget
   * @param {Object} opts - overrides for DEFAULT_CONFIG
   */
  init: function init(opts) {
    CONFIG = shallowMerge(DEFAULT_CONFIG, opts || {});
    if (CONFIG.persistHistory) {
      HISTORY = lsGet(CONFIG.storageKey, []);
      if (!Array.isArray(HISTORY)) HISTORY = [];
    } else {
      HISTORY = [];
    }
    buildUI();
    if (CONFIG.greeting) {
      addMsg("assistant", CONFIG.greeting, { meta: true });
    } else if (CONFIG.showTopics) {
      renderTopics();
    }
  }
};

// ===================== UI Construction =====================

function buildUI() {
  // Root
  ROOT = document.createElement("section");
  ROOT.id = "tcw";
  ROOT.setAttribute("role", "dialog");
  ROOT.setAttribute("aria-label", CONFIG.ariaLabel);
  ROOT.className = "tcw-root";
  document.body.appendChild(ROOT);

  // Header
  var header = document.createElement("header");
  header.className = "tcw-header";
  header.innerHTML = `
    <div class="tcw-title" id="tcw-title" aria-live="polite">${esc(CONFIG.title || "Chat")}</div>
    <button class="tcw-close" id="tcw-close" type="button" aria-label="Close chat" title="Close">×</button>
  `;
  ROOT.appendChild(header);

  // Pane
  PANE = document.createElement("div");
  PANE.id = "tcw-messages";
  PANE.className = "tcw-messages";
  PANE.setAttribute("role", "log");
  PANE.setAttribute("aria-live", "polite");
  ROOT.appendChild(PANE);

  // Restore persisted history visually
  if (HISTORY.length > 0) {
    for (var i = 0; i < HISTORY.length; i++) {
      addMsg(HISTORY[i].role, HISTORY[i].content, { restoring: true });
    }
    scrollToBottom();
  }

  // Input area
  FORM = document.createElement("form");
  FORM.className = "tcw-form";
  FORM.setAttribute("novalidate", "novalidate");
  FORM.innerHTML = `
    <label for="tcw-input" class="tcw-visually-hidden">Type your message</label>
    <textarea id="tcw-input" class="tcw-input" rows="1" placeholder="Type a message…" autocomplete="off"></textarea>
    <button class="tcw-send" id="tcw-send" type="submit" aria-label="Send message" title="Send">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
           width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
      </svg>
    </button>
  `;
  ROOT.appendChild(FORM);

  INPUT = FORM.querySelector("#tcw-input");
  SEND_BTN = FORM.querySelector("#tcw-send");

  // Events
  FORM.addEventListener("submit", onSubmit);
  INPUT.addEventListener("input", function () { autoGrowTextarea(INPUT, 1); });
  INPUT.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      SEND_BTN.click();
    }
  });
  document.getElementById("tcw-close").addEventListener("click", function () {
    // non-destructive close: just collapse; keep node for quick reopen if you implement a launcher
    ROOT.style.display = "none";
  });

  // First autogrow pass
  autoGrowTextarea(INPUT, 1);

  // Resize observer keeps height/scroll nice when keyboard shows on mobile
  var debounced = debounce(scrollToBottom, 120);
  window.addEventListener("resize", debounced);
}

// ===================== Topics (starter chips) =====================

function renderTopics() {
  if (!CONFIG.topics || !CONFIG.topics.length) return;
  var box = document.createElement("div");
  box.className = "tcw-topics";

  var heading = document.createElement("div");
  heading.className = "tcw-topics-title";
  heading.textContent = "Try one of these:";
  box.appendChild(heading);

  var list = document.createElement("div");
  list.className = "tcw-topics-list";

  CONFIG.topics.forEach(function (t) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "tcw-topic";
    b.setAttribute("aria-label", t.title);
    b.textContent = t.title;
    b.addEventListener("click", function () {
      // insert as user message
      INPUT.value = t.body || t.title;
      autoGrowTextarea(INPUT, 1);
      SEND_BTN.click();
      box.remove();
    });
    list.appendChild(b);
  });

  box.appendChild(list);
  PANE.appendChild(box);
}

// ===================== Message Rendering =====================

function addMsg(role, content, opts) {
  opts = opts || {};
  var row = document.createElement("div");
  row.className = "tcw-row " + (role === "user" ? "tcw-row-user" : "tcw-row-assistant");

  var bubble = document.createElement("div");
  bubble.className = "tcw-bubble " + (role === "user" ? "tcw-bubble-user" : "tcw-bubble-assistant");

  // meta messages (greeting/restoring) don't need timestamps
  var t = nowISO();
  var meta = opts.meta ? "" : `<time class="tcw-time" datetime="${esc(t)}">${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</time>`;

  bubble.innerHTML = `
    <div class="tcw-content">${esc(content)}</div>
    ${meta}
  `;

  row.appendChild(bubble);
  PANE.appendChild(row);

  // If this is an assistant message that invites continuation, add chip via opts.continueChip
  if (opts.continueChip) {
    addContinueChip(bubble);
  }

  if (!opts.restoring) scrollToBottom();
}

function addContinueChip(bubbleEl) {
  if (CONTINUE_ACTIVE) return; // allow only one at a time in view
  var chip = document.createElement("button");
  chip.type = "button";
  chip.className = "tcw-continue";
  chip.textContent = "Continue";
  chip.addEventListener("click", function () {
    CONTINUE_ACTIVE = false;
    sendMessage("continue");
    chip.disabled = true;
    chip.textContent = "Continuing…";
  });
  bubbleEl.appendChild(document.createElement("br"));
  bubbleEl.appendChild(chip);
  CONTINUE_ACTIVE = true;
}

function scrollToBottom() {
  if (!PANE) return;
  PANE.scrollTop = PANE.scrollHeight + 999;
}

// ===================== Network: Sending =====================

async function onSubmit(e) {
  e.preventDefault();
  if (BUSY) return;

  var text = (INPUT.value || "").trim();
  if (!text) return;

  INPUT.value = "";
  autoGrowTextarea(INPUT, 1);

  // clear starter topics if still visible
  var tbox = PANE.querySelector(".tcw-topics");
  if (tbox) tbox.remove();

  addMsg("user", text);
  pushHistory("user", text);
  await sendToWorker(text);
}

async function sendMessage(text) {
  if (BUSY) return;
  text = String(text || "").trim();
  if (!text) return;
  addMsg("user", text);
  pushHistory("user", text);
  await sendToWorker(text);
}

function pushHistory(role, content) {
  HISTORY.push({ role: role, content: content });
  if (HISTORY.length > CONFIG.maxHistory) {
    HISTORY = HISTORY.slice(-CONFIG.maxHistory);
  }
  if (CONFIG.persistHistory) {
    lsSet(CONFIG.storageKey, HISTORY);
  }
}

function popLastAssistantIfPlaceholder() {
  var rows = PANE.querySelectorAll(".tcw-row-assistant .tcw-bubble .tcw-content");
  if (!rows || !rows.length) return;
  var last = rows[rows.length - 1];
  if (last && last.textContent === "…") {
    // Remove entire row
    var bubble = last.closest(".tcw-bubble");
    var row = bubble.closest(".tcw-row");
    if (row && row.parentNode) row.parentNode.removeChild(row);
  }
}

async function sendToWorker(text) {
  BUSY = true;

  // Assistant thinking placeholder
  addMsg("assistant", "…", { meta: true });

  var payload = {
    // Your Worker expects OpenAI-style messages (we convert simple history to that)
    messages: HISTORY.map(function (m) { return { role: m.role, content: m.content }; }),
    model: CONFIG.model,
    temperature: CONFIG.temperature,

    // Absolute URLs so the Worker can fetch them even if the site origin differs
    systemUrl: toAbsolute(CONFIG.systemUrl),
    kbUrl: toAbsolute(CONFIG.kbUrl)
  };

  try {
    var res = await safeFetch(CONFIG.workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    var j = await res.json();

    // Remove placeholder
    popLastAssistantIfPlaceholder();

    if (j && j.error) {
      var msg = "Oops, something went wrong: " + (j.error.message || j.error || "Unknown error");
      addMsg("assistant", msg);
      pushHistory("assistant", msg);
      BUSY = false;
      return;
    }

    var content = (j && isString(j.content)) ? j.content : "";
    var finishReason = (j && j.finish_reason) ? j.finish_reason : "stop";

    addMsg("assistant", content, { continueChip: finishReason !== "stop" });
    pushHistory("assistant", content);
  } catch (err) {
    // Remove placeholder
    popLastAssistantIfPlaceholder();
    var em = "Network error. Please try again.";
    addMsg("assistant", em);
    pushHistory("assistant", em);
  } finally {
    BUSY = false;
    scrollToBottom();
  }
}

async function safeFetch(url, opts, retries, backoffMs) {
  retries = retries == null ? 1 : retries;
  backoffMs = backoffMs == null ? 600 : backoffMs;

  try {
    var r = await fetch(url, opts);
    if (!r.ok) {
      if (retries > 0 && (r.status >= 500 || r.status === 429)) {
        await new Promise(function (res) { setTimeout(res, backoffMs); });
        return safeFetch(url, opts, retries - 1, backoffMs * 2);
      }
      return r; // let caller handle non-OK (usually JSON error body)
    }
    return r;
  } catch (e) {
    if (retries > 0) {
      await new Promise(function (res) { setTimeout(res, backoffMs); });
      return safeFetch(url, opts, retries - 1, backoffMs * 2);
    }
    throw e;
  }
}

// ===================== Minimal Markdown (Optional) =====================
// If you want basic formatting in bubbles (bold, bullets), you can enable this renderer.
// Currently not enabled to keep parity with plain text history persistence.
// To enable, replace addMsg() setting of innerHTML for .tcw-content with renderBasicMarkdown(content).

function renderBasicMarkdown(s) {
  // very small subset: **bold**, *italic*, bullets (- ), numbered (1. )
  var html = esc(s);
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // lists
  html = html.replace(/(^|\n)[ \t]*-\s+(.+?)(?=\n|$)/g, function (_, p1, item) {
    return (p1 || "") + "<li>" + item + "</li>";
  });
  // numbers
  html = html.replace(/(^|\n)[ \t]*\d+\.\s+(.+?)(?=\n|$)/g, function (_, p1, item) {
    return (p1 || "") + "<li>" + item + "</li>";
  });
  // wrap orphan <li> sequences into <ul>
  html = html.replace(/(?:<li>[\s\S]*?<\/li>)/g, function (m) {
    // naive grouping is okay for short replies
    return "<ul>" + m + "</ul>";
  });
  return html;
}

// ===================== Styles (scoped, minimal) =====================
// These default styles only apply if you don't already have a stylesheet.
// They aim to match your preference for lighter grays. You can delete this
// block if your site CSS already defines the classes.

;(function injectStyles() {
  var css = `
:root {
  --tcw-gray-50:  #fafafa;
  --tcw-gray-100: #f6f6f7;
  --tcw-gray-150: #f1f1f2;
  --tcw-gray-200: #ececee;
  --tcw-gray-300: #e5e5e7;
  --tcw-gray-700: #2f2f33;
  --tcw-border:   #e7e7ea;
  --tcw-accent:   ${esc(CONFIG && CONFIG.brand ? CONFIG.brand.accent : DEFAULT_CONFIG.brand.accent)};
  --tcw-radius:   ${esc(CONFIG && CONFIG.brand ? CONFIG.brand.radius : DEFAULT_CONFIG.brand.radius)};
}

.tcw-root {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 360px;
  max-width: 92vw;
  background: #fff;
  border: 1px solid var(--tcw-border);
  border-radius: var(--tcw-radius);
  box-shadow: 0 14px 36px rgba(0,0,0,.14);
  font: 14px/1.45 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  color: #111;
  z-index: 2147483647;
}

.tcw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--tcw-gray-150);
  border-bottom: 1px solid var(--tcw-border);
  padding: 10px 12px;
}
.tcw-title { font-weight: 700; }
.tcw-close {
  border: 0;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  color: #666;
}

.tcw-messages {
  height: 380px;
  overflow-y: auto;
  padding: 12px;
  background: var(--tcw-gray-50);
}

.tcw-row { display: flex; margin: 6px 0; }
.tcw-row-user { justify-content: flex-end; }
.tcw-row-assistant { justify-content: flex-start; }

.tcw-bubble {
  max-width: 86%;
  border: 1px solid var(--tcw-border);
  border-radius: 14px;
  padding: 10px 12px;
  background: #fff;
}
.tcw-bubble-user { background: var(--tcw-gray-100); }
.tcw-bubble-assistant { background: #fff; }
.tcw-content { white-space: pre-wrap; word-wrap: break-word; }
.tcw-time { display: block; margin-top: 6px; color: #777; font-size: 11px; }

.tcw-form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid var(--tcw-border);
  background: #fff;
}
.tcw-input {
  width: 100%;
  min-height: 38px;
  max-height: 120px;
  resize: none;
  border: 1px solid var(--tcw-border);
  background: #fff;
  border-radius: 12px;
  padding: 10px 12px;
  outline: none;
}
.tcw-input:focus { border-color: var(--tcw-accent); box-shadow: 0 0 0 3px rgba(62,84,148,.08); }

.tcw-send {
  border: 0;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--tcw-accent);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.tcw-send svg { opacity: .85; } /* lighter look; inherits currentColor via fill=currentColor */

.tcw-topics {
  background: #fff;
  border: 1px dashed var(--tcw-border);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
.tcw-topics-title { font-weight: 600; margin-bottom: 8px; }
.tcw-topics-list { display: flex; flex-wrap: wrap; gap: 8px; }
.tcw-topic {
  border: 1px solid var(--tcw-border);
  background: var(--tcw-gray-100);
  color: #111;
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
}

.tcw-continue {
  margin-top: 6px;
  border: 1px solid var(--tcw-border);
  background: transparent;
  color: #111;
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
}

/* a11y helper */
.tcw-visually-hidden {
  position: absolute !important;
  width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
`;
  var style = document.createElement("style");
  style.setAttribute("data-tcw", "inline");
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
})();

// ===================== End of File =====================
