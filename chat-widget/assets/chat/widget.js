// chat-widget/assets/chat/widget.js
// Tony Chat Widget — Extended build
// - Uses system.md (behavior) + about-tony.md (knowledge) only
// - Shows greeting once on open (no re-greet on first reply)
// - Enter sends, Shift+Enter = newline
// - Optional history persistence via config.persistHistory
// - Markdown rendering (lists, bold, code) + sanitizer
// - Header-offset aware launcher; updates on resize
// - Focus trap and a11y roles/labels
(function () {
  "use strict";

  /* ===================== Config ===================== */
  const DEFAULTS = {
    workerUrl: "https://my-chat-agent.tonyabdelmalak.workers.dev/chat",
    systemUrl: "/chat-widget/assets/chat/system.md",
    kbUrl: "/chat-widget/assets/chat/about-tony.md",
    model: "llama-3.1-8b-instant",
    temperature: 0.275,
    title: "Hi, I'm Tony. What's on your mind?",
    subtitle: "",
    brand: { accent: "#2f3a4f", radius: "18px" },
    greeting:
      "I'm happy to answer your questions about my background, specific projects/dashboards, or what I’m currently working towards.",
    maxHistory: 16,
    avatarUrl: "/assets/img/profile-img.jpg",
    persistHistory: false,          // if true, stores session in localStorage
    storageKey: "tony-cw-history",  // storage key when persistHistory = true
    typingDelayMs: 0                // 0 = show instantly; >0 would simulate streaming
  };

  /* ===================== State ===================== */
  let CFG = null;
  const UI = {};
  let HISTORY = [];            // array of {role, content}
  let OPEN = false;
  let BUSY = false;
  let greetingShown = false;   // suppress duplicate greeting
  let trapPrevFocus = null;    // focus trap return target
  let detachFns = [];          // for cleanup on hot reloads

  /* ===================== Utilities ===================== */
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const setVar = (n, v) => document.documentElement.style.setProperty(n, v);

  const on = (el, ev, fn, opts) => {
    el.addEventListener(ev, fn, opts);
    detachFns.push(() => el.removeEventListener(ev, fn, opts));
  };

  const throttle = (fn, ms) => {
    let t = 0;
    return (...a) => {
      const now = Date.now();
      if (now - t >= ms) {
        t = now;
        fn(...a);
      }
    };
  };

  const scrollPane = () => {
    if (UI.pane) UI.pane.scrollTop = UI.pane.scrollHeight;
  };

  const growInput = () => {
    const el = UI.input;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  const computeHeaderOffset = () => {
    const el =
      document.querySelector("header.site-header") ||
      document.querySelector("header.header") ||
      document.querySelector("nav.navbar") ||
      document.querySelector('nav[role="navigation"]') ||
      document.querySelector("header") ||
      document.querySelector("nav");
    const h = el ? el.getBoundingClientRect().height : 64;
    document.documentElement.style.setProperty("--cw-top-offset", h + 24 + "px");
  };

  /* ===================== Storage ===================== */
  const loadHistory = () => {
    if (!CFG.persistHistory) return;
    try {
      const raw = localStorage.getItem(CFG.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data)) HISTORY = data.slice(-CFG.maxHistory);
    } catch (_) {}
  };

  const saveHistory = () => {
    if (!CFG.persistHistory) return;
    try {
      localStorage.setItem(
        CFG.storageKey,
        JSON.stringify(HISTORY.slice(-CFG.maxHistory))
      );
    } catch (_) {}
  };

  const clearHistory = () => {
    HISTORY.length = 0;
    saveHistory();
  };

  /* ===================== Markdown ===================== */
  function sanitizeBlocks(html) {
    try {
      const doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html");
      ["script", "style", "iframe", "object", "embed", "link"].forEach((sel) =>
        doc.querySelectorAll(sel).forEach((n) => n.remove())
      );
      doc.querySelectorAll("a").forEach((a) => {
        a.setAttribute("rel", "noopener noreferrer");
        a.setAttribute("target", "_blank");
      });
      return doc.body.firstChild.innerHTML;
    } catch {
      return html;
    }
  }

  function mdToHtml(input) {
    let s = esc(String(input || "")).replace(/\r\n/g, "\n");

    // Fenced code blocks
    s = s.replace(
      /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g,
      (_, lang, code) =>
        `<pre><code${lang ? ` class="language-${lang.toLowerCase()}"` : ""}>${code.replace(
          /</g,
          "&lt;"
        )}</code></pre>`
    );
    // Inline code
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Headings -> bold line
    s = s.replace(/^\s*#{1,6}\s*(.+)$/gm, "<strong>$1</strong>");
    // Bold/Italic
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    // Links
    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    // Ordered lists
    s = s.replace(/^(?:\d+\.)\s+.+(?:\n\d+\.\s+.+)*/gm, (list) => {
      const items = list
        .split("\n")
        .map((l) => l.replace(/^\d+\.\s+(.+)$/, "<li>$1</li>"))
        .join("");
      return `<ol>${items}</ol>`;
    });
    // Unordered lists
    s = s.replace(/^(?:-\s+|\*\s+).+(?:\n(?:-\s+|\*\s+).+)*/gm, (list) => {
      const items = list
        .split("\n")
        .map((l) => l.replace(/^(?:-\s+|\*\s+)(.+)$/, "<li>$1</li>"))
        .join("");
      return `<ul>${items}</ul>`;
    });
    // Paragraphs and line breaks
    const blocks = s.split(/\n{2,}/).map((b) => {
      if (/^<(ul|ol|pre|blockquote|strong)/.test(b.trim())) return b;
      return `<p>${b.replace(/\n/g, "<br>")}</p>`;
    });
    return sanitizeBlocks(blocks.join(""));
  }

  /* ===================== UI Builders ===================== */
  function buildLauncher() {
    const btn = document.createElement("button");
    btn.id = "cw-launcher";
    btn.setAttribute("aria-label", "Open chat");
    btn.innerHTML =
      `<div class="cw-avatar-wrap">
         <img src="${esc(CFG.avatarUrl)}" alt="Tony Avatar">
         <div class="cw-bubble">1</div>
       </div>`;
    document.body.appendChild(btn);
    UI.launcher = btn;
  }

  function buildRoot() {
    const root = document.createElement("div");
    root.className = "cw-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Tony Chat");
    root.style.display = "none";
    document.body.appendChild(root);
    UI.root = root;

    // Header
    const hdr = document.createElement("div");
    hdr.className = "cw-header";
    hdr.innerHTML =
      `<div class="cw-head">
         <div class="cw-title">${esc(CFG.title)}</div>
         ${CFG.subtitle ? `<div class="cw-subtitle">${esc(CFG.subtitle)}</div>` : ""}
       </div>
       <button class="cw-close" aria-label="Close chat" title="Close">&times;</button>`;
    root.appendChild(hdr);
    UI.close = hdr.querySelector(".cw-close");

    // Messages
    const pane = document.createElement("div");
    pane.className = "cw-messages";
    pane.id = "cw-messages";
    pane.setAttribute("role", "log");
    pane.setAttribute("aria-live", "polite");
    root.appendChild(pane);
    UI.pane = pane;

    // Form
    const form = document.createElement("form");
    form.className = "cw-form";
    form.setAttribute("novalidate", "novalidate");
    form.innerHTML =
      `<textarea id="cw-input" class="cw-input" placeholder="Type a message..." rows="1" aria-label="Message input"></textarea>
       <button type="submit" id="cw-send" class="cw-send" aria-label="Send message" title="Send">
         <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 2 L18 10 L2 18 L2 11 L11 10 L2 9 Z"></path></svg>
       </button>`;
    root.appendChild(form);
    UI.form = form;
    UI.input = form.querySelector("#cw-input");
    UI.send = form.querySelector("#cw-send");

    // Initial greeting in pane only when opened (handled in openChat)
  }

  /* ===================== Rendering ===================== */
  function addRow(role, htmlOrText, isHtml) {
    const row = document.createElement("div");
    row.className = "cw-row " + (role === "assistant" ? "cw-row-assistant" : "cw-row-user");

    const bubble = document.createElement("div");
    bubble.className = "cw-bubble " + (role === "assistant" ? "cw-bubble-assistant" : "cw-bubble-user");
    if (isHtml) bubble.innerHTML = htmlOrText;
    else bubble.textContent = htmlOrText;

    row.appendChild(bubble);
    UI.pane.appendChild(row);
    scrollPane();
    return row;
  }

  function addAssistant(text) {
    addRow("assistant", mdToHtml(text), true);
  }
  function addUser(text) {
    addRow("user", text, false);
  }
  function addTyping() {
    const row = document.createElement("div");
    row.className = "cw-row cw-row-assistant cw-typing";
    row.innerHTML =
      '<div class="cw-bubble cw-bubble-assistant"><span class="cw-dots"><i></i><i></i><i></i></span></div>';
    UI.pane.appendChild(row);
    scrollPane();
    return { remove: () => row.remove() };
  }

  /* ===================== Focus Trap ===================== */
  function trapFocus() {
    trapPrevFocus = document.activeElement;
    const focusables = UI.root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const list = Array.from(focusables);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];

    const handler = (e) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    on(UI.root, "keydown", handler);
    first.focus();
  }

  function releaseFocus() {
    if (trapPrevFocus && typeof trapPrevFocus.focus === "function") {
      trapPrevFocus.focus();
    }
  }

  /* ===================== Transport ===================== */
  function makePayload(userText) {
    const recent = HISTORY.slice(-CFG.maxHistory);
    const msgs = recent.concat([{ role: "user", content: userText }]);

    // One-time nudge: avoid re-greeting in first assistant reply
    if (greetingShown && !recent.some((m) => m.role === "user")) {
      msgs.unshift({
        role: "system",
        content:
          "The UI already displayed a greeting. Answer directly without re-greeting."
      });
    }

    return {
      model: CFG.model,
      temperature: CFG.temperature,
      messages: msgs,
      systemUrl: CFG.systemUrl,
      kbUrl: CFG.kbUrl
    };
  }

  async function sendToWorker(userText) {
    const r = await fetch(CFG.workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makePayload(userText))
    });
    const ok = r.ok;
    let data = null,
      txt = "";
    try {
      data = await r.json();
    } catch {
      txt = await r.text();
    }
    if (!ok) throw new Error((data && data.error) || txt || "HTTP " + r.status);

    const content =
      data?.content ||
      data?.reply ||
      data?.choices?.[0]?.message?.content ||
      "";

    return content || "I couldn’t generate a reply just now.";
  }

  /* ===================== Handlers ===================== */
  async function onSubmit(e) {
    e.preventDefault();
    if (BUSY) return;

    const text = (UI.input.value || "").trim();
    if (!text) return;

    addUser(text);
    HISTORY.push({ role: "user", content: text });
    saveHistory();

    UI.input.value = "";
    growInput();

    const typing = addTyping();
    BUSY = true;
    UI.send.disabled = true;

    try {
      let reply = await sendToWorker(text);

      // Strip duplicate greeting at start of first reply
      reply = reply.replace(/^hi[,!.\s]*i['’]m tony.*\n?/i, "").trim() || reply;

      // Optional typing delay (visual)
      if (CFG.typingDelayMs > 0) await new Promise((r) => setTimeout(r, CFG.typingDelayMs));

      addAssistant(reply);
      HISTORY.push({ role: "assistant", content: reply });
      saveHistory();
    } catch (err) {
      console.error(err);
      addAssistant("Sorry — I ran into an error. Please try again.");
    } finally {
      typing.remove();
      BUSY = false;
      UI.send.disabled = false;
      scrollPane();
    }
  }

  function openChat() {
    if (OPEN) return;
    OPEN = true;
    UI.root.style.display = "block";
    document.documentElement.classList.add("cw-open");
    trapFocus();

    // Greeting once on open (not on first model reply)
    if (CFG.greeting && !greetingShown) {
      addAssistant(CFG.greeting);
      HISTORY.push({ role: "assistant", content: CFG.greeting });
      saveHistory();
      greetingShown = true;
    }
    UI.input.focus();
    scrollPane();
  }

  function closeChat() {
    if (!OPEN) return;
    OPEN = false;
    UI.root.style.display = "none";
    document.documentElement.classList.remove("cw-open");
    releaseFocus();
  }

  function bindEvents() {
    on(UI.launcher, "click", openChat);
    on(UI.close, "click", closeChat);

    // Submit via button
    on(UI.form, "submit", onSubmit);

    // Enter sends; Shift+Enter newline
    on(UI.input, "keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        UI.form.requestSubmit();
      }
    });

    // Auto-grow input
    on(UI.input, "input", growInput);

    // Resize-aware launcher offset
    computeHeaderOffset();
    const onResize = throttle(computeHeaderOffset, 200);
    on(window, "resize", onResize);

    // ESC closes
    on(document, "keydown", (e) => {
      if (e.key === "Escape" && OPEN) closeChat();
    });
  }

  /* ===================== Boot ===================== */
  async function init() {
    // Cleanup if hot reloading
    detachFns.forEach((fn) => fn());
    detachFns = [];

    // Load config
    try {
      const r = await fetch("/chat-widget/assets/chat/config.json?ts=" + Date.now(), {
        cache: "no-store"
      });
      const cfg = r.ok ? await r.json() : {};
      CFG = Object.assign({}, DEFAULTS, cfg || {});
    } catch {
      CFG = Object.assign({}, DEFAULTS);
    }

    // Theme vars
    if (CFG.brand?.accent) setVar("--cw-accent", CFG.brand.accent);
    if (CFG.brand?.radius) setVar("--cw-radius", CFG.brand.radius);

    // History
    loadHistory();

    // Build UI
    buildLauncher();
    buildRoot();
    bindEvents();

    // If there is persisted history, render last assistant message preview (optional)
    // We do not auto-open the panel; greeting will show on first open if never shown.
  }

  // DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
