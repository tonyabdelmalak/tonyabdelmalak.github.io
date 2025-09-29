// Chat Widget — /chat-widget/assets/chat/widget.js
// Visuals handled by widget.css. This JS wires up the UI + calls your Cloudflare worker.
// Features: navy/gray theme (via CSS vars), +1/2" taller panel, avatar, typing dots,
// "new chat on reopen", no word cap (+ Continue chip), cleaner “Some highlights include —”.

(function () {
  "use strict";

  /* ---------- tiny utils ---------- */
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function merge(a, b) {
    const out = {};
    a = a || {}; b = b || {};
    for (const k in a) out[k] = a[k];
    for (const k in b) out[k] = b[k];
    return out;
  }
  function el(tag, attrs = {}, children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach((c) => c && n.appendChild(c));
    }
    return n;
  }

  /* ---------- config ---------- */
  const DEFAULTS = {
    workerUrl: "https://my-chat-agent.tonyabdelmalak.workers.dev/chat",
    systemUrl: "/chat-widget/assets/chat/system.md",
    model: "llama-3.1-8b-instant",
    temperature: 0.2,

    title: "What’s on your mind?",
    greeting: "Hi — I’m Tony’s chat. Ask about projects, dashboards, or experience.",

    brand: {
      accent: "#3e5494",
      bubbleUser: "#e9edf6",
      bubbleBot: "#ffffff",
      textDark: "#1b1f2a",
      textSub: "#5c6578",
      border: "#d6d9e3",
      radius: "14px"
    },

    // Optional; hides gracefully if the file isn’t present
    avatarUrl: "/chat-widget/assets/chat/tony-avatar.png"
  };

  // Avoid double-bootstrapping
  if (window.__TONY_WIDGET__) return;

  function buildWidget(userCfg = {}) {
    const cfg = merge(DEFAULTS, userCfg);

    /* ---------- launcher ---------- */
    const launcher = el("button", {
      class: "cw-launcher",
      type: "button",
      "aria-label": "Open chat",
      title: "Chat"
    });
    launcher.innerHTML = `
      <span class="cw-launcher-dot"></span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
      </svg>
    `;

    /* ---------- panel ---------- */
    const panel = el("section", { class: "cw-panel", "aria-live": "polite" });

    const header = el("header", { class: "cw-header" });
    const title = el("div", { class: "cw-title", html: esc(cfg.title || "Chat") });
    const closeBtn = el("button", {
      class: "cw-close",
      id: "cw-close",
      type: "button",
      "aria-label": "Close chat",
      title: "Close"
    });
    closeBtn.textContent = "×";
    header.appendChild(title);
    header.appendChild(closeBtn);

    const messages = el("div", { class: "cw-messages", id: "cw-messages", role: "log", "aria-live": "polite" });

    const typing = el("div", { class: "cw-typing", "aria-hidden": "true" });
    typing.innerHTML = `
      <div class="cw-typing-bubble">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
    `;

    const form = el("form", { class: "cw-form", id: "cw-form", novalidate: "" });
    const label = el("label", { for: "cw-input", class: "cw-visually-hidden" });
    label.textContent = "Type your message";
    const input = el("textarea", {
      id: "cw-input",
      class: "cw-input",
      rows: "1",
      placeholder: "Type a message…",
      autocomplete: "off"
    });
    const send = el("button", {
      class: "cw-send",
      id: "cw-send",
      type: "submit",
      "aria-label": "Send message",
      title: "Send"
    });
    send.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M2 3l20 9-20 9 4-9-4-9zm6.5 9l-2.5 5 10-5-10-5 2.5 5z"/>
      </svg>
    `;
    form.appendChild(label);
    form.appendChild(input);
    form.appendChild(send);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(typing);
    panel.appendChild(form);

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    /* ---------- session state (cleared each open) ---------- */
    let history = [];

    function avatarHTML() {
      if (cfg.avatarUrl) {
        return `<img class="cw-avatar" src="${esc(cfg.avatarUrl)}" alt="Tony avatar" onerror="this.style.display='none'">`;
      }
      return `<div class="cw-avatar cw-avatar-fallback">TA</div>`;
    }
    function addUser(text) {
      const item = el("div", { class: "cw-item user" });
      const bubble = el("div", { class: "cw-bubble", html: `<div class="cw-bubble-inner">${esc(text)}</div>` });
      item.appendChild(bubble);
      messages.appendChild(item);
      messages.scrollTop = messages.scrollHeight;
    }
    function addBot(htmlText) {
      const item = el("div", { class: "cw-item bot" });
      const avatar = el("div", { class: "cw-avatar-wrap", html: avatarHTML() });
      const bubble = el("div", { class: "cw-bubble", html: `<div class="cw-bubble-inner">${htmlText}</div>` });
      item.appendChild(avatar);
      item.appendChild(bubble);
      messages.appendChild(item);
      messages.scrollTop = messages.scrollHeight;
    }
    function showTyping(show) {
      typing.setAttribute("aria-hidden", show ? "false" : "true");
      typing.style.display = show ? "flex" : "none";
      messages.scrollTop = messages.scrollHeight;
    }
    function clearSession() {
      history = [];
      messages.innerHTML = "";
      showTyping(false);
    }

    /* ---------- open/close ---------- */
    function openPanel() {
      panel.classList.add("open");
      launcher.classList.add("open");
      clearSession();                          // new chat on every open
      if (cfg.greeting) addBot(esc(cfg.greeting));
      input.focus();
    }
    function closePanel() {
      panel.classList.remove("open");
      launcher.classList.remove("open");
      clearSession();                           // also clear on close
    }
    launcher.addEventListener("click", openPanel);
    closeBtn.addEventListener("click", closePanel);

    /* ---------- networking ---------- */
    async function askWorker(prompt) {
      const body = {
        messages: [
          { role: "system", content: `Model: ${cfg.model}; temp=${cfg.temperature}` },
          ...history,
          { role: "user", content: prompt }
        ],
        model: cfg.model,
        temperature: cfg.temperature,
        systemUrl: cfg.systemUrl
      };

      const res = await fetch(cfg.workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      let data = {};
      try { data = await res.json(); } catch (_) {}

      // common shapes
      let text =
        data?.answer ??
        data?.content ??
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.delta?.content ??
        "";

      if (!text) text = "Sorry — I couldn’t parse a response.";
      return String(text);
    }

    /* ---------- Continue chip ---------- */
    function addContinueButton() {
      const row = el("div", { class: "cw-continue-row" });
      const btn = el("button", { class: "cw-continue", type: "button" });
      btn.textContent = "Continue";
      btn.addEventListener("click", () => {
        row.remove();
        sendPrompt("continue");
      });
      messages.appendChild(row);
      row.appendChild(btn);
      messages.scrollTop = messages.scrollHeight;
    }

    /* ---------- send flow ---------- */
    async function sendPrompt(prompt) {
      const text = (prompt ?? input.value).trim();
      if (!text) return;

      addUser(text);
      history.push({ role: "user", content: text });
      input.value = "";
      input.style.height = "auto";

      try {
        showTyping(true);
        const raw = await askWorker(text);
        showTyping(false);

        // cleanup small redundancy
        const cleaned = raw.replace(/Some highlights include\s*—/gi, "Some highlights include:");

        addBot(esc(cleaned));
        history.push({ role: "assistant", content: cleaned });

        // looks truncated? offer Continue
        if (/[a-zA-Z0-9][^.?!)]$/.test(cleaned.trim())) {
          addContinueButton();
        }
      } catch (err) {
        showTyping(false);
        addBot(esc("Hmm, I hit a network snag. Try again in a moment."));
      }
    }

    // autoresize
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(140, input.scrollHeight) + "px";
    });

    // submit
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      sendPrompt();
    });

    // Enter to send, Shift+Enter newline
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendPrompt();
      }
    });

    /* ---------- live brand hook ---------- */
    function applyBrand(b) {
      const r = document.documentElement;
      r.style.setProperty("--cw-accent", b.accent || DEFAULTS.brand.accent);
      r.style.setProperty("--cw-bubble-user", b.bubbleUser || DEFAULTS.brand.bubbleUser);
      r.style.setProperty("--cw-bubble-bot", b.bubbleBot || DEFAULTS.brand.bubbleBot);
      r.style.setProperty("--cw-text-dark", b.textDark || DEFAULTS.brand.textDark);
      r.style.setProperty("--cw-text-sub", b.textSub || DEFAULTS.brand.textSub);
      r.style.setProperty("--cw-border", b.border || DEFAULTS.brand.border);
      r.style.setProperty("--cw-radius", b.radius || DEFAULTS.brand.radius);
    }
    applyBrand(cfg.brand || DEFAULTS.brand);

    window.TonyChatWidget = {
      open: openPanel,
      close: closePanel,
      init: (overrides = {}) => {
        const merged = merge(cfg, overrides);
        applyBrand(merged.brand || cfg.brand);
      }
    };
  }

  buildWidget();
  window.__TONY_WIDGET__ = true;
})();
