/* chat-widget/assets/chat/widget.js
   Reads /chat-widget/assets/chat/config.json and wires a reliable chat UI.
   No other edits needed on the page except adding:
     <link rel="stylesheet" href="/chat-widget/assets/chat/widget.css">
     <script defer src="/chat-widget/assets/chat/widget.js"></script>
*/
(() => {
  // ---- Singleton guard (avoid double init if script is included twice) ----
  if (window.__TONY_CHAT_INIT__) return;
  window.__TONY_CHAT_INIT__ = true;

  // ---- Config & defaults ---------------------------------------------------
  const CONFIG_URL = "/chat-widget/assets/chat/config.json";
  const DEFAULTS = {
    workerUrl: "",                                // set in config.json
    systemUrl: "/chat-widget/assets/chat/system.md",
    model: "llama-3.1-70b-versatile",
    temperature: 0.2,
    title: "Chat with Tony",
    greeting: "Hi! Ask me anything — I’ll reply here.",
    accent: "#2563eb",
    radius: "12px",
    rateLimit: 10,
    avatar: "/assets/chat/avatar-tony.jpg"        // change if your avatar lives elsewhere
  };
  let CFG = { ...DEFAULTS };

  // ---- Tiny helpers --------------------------------------------------------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };

  // naive hex -> darker hex (for gradient second color)
  function darken(hex, amt = 0.18) {
    try {
      const h = hex.replace("#", "");
      const v = h.length === 3
        ? h.split("").map(c => c + c).join("")
        : h;
      const r = Math.max(0, Math.min(255, parseInt(v.slice(0, 2), 16) * (1 - amt)));
      const g = Math.max(0, Math.min(255, parseInt(v.slice(2, 4), 16) * (1 - amt)));
      const b = Math.max(0, Math.min(255, parseInt(v.slice(4, 6), 16) * (1 - amt)));
      const toHex = n => n.toString(16).padStart(2, "0");
      return `#${toHex(Math.round(r))}${toHex(Math.round(g))}${toHex(Math.round(b))}`;
    } catch { return hex; }
  }

  async function loadConfig() {
    try {
      const res = await fetch(CONFIG_URL, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        CFG = { ...DEFAULTS, ...json };
      }
    } catch (_) {
      // keep defaults if config fetch fails
    }
  }

  // ---- Rate limit (per-minute sliding window) ------------------------------
  const sentTimestamps = [];
  function canSend() {
    const now = Date.now();
    // keep last 60s
    while (sentTimestamps.length && now - sentTimestamps[0] > 60_000) {
      sentTimestamps.shift();
    }
    return sentTimestamps.length < Number(CFG.rateLimit || 10);
  }
  function markSent() { sentTimestamps.push(Date.now()); }

  // ---- Build UI ------------------------------------------------------------
  const launcher = el("button", "chat-launcher");
  launcher.id = "chat-launcher";

  const box = el("section", "chat-container chat-hidden");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");

  // header + messages + input
  box.innerHTML = `
    <header class="chat-header">
      <div class="title">
        <img class="chat-avatar" alt="Tony">
        <div>
          <div class="chat-title"></div>
          <div class="sub">We are online!</div>
        </div>
      </div>
      <button class="close" title="Close" type="button">✕</button>
    </header>
    <div class="chat-messages" id="chat-messages" aria-live="polite"></div>
    <form class="chat-input" id="chat-form">
      <textarea id="chat-text" placeholder="Enter your message..." rows="1"></textarea>
      <button type="submit" title="Send">➤</button>
    </form>
  `;

  // ---- State & behaviors ---------------------------------------------------
  const msgs = []; // {role: 'user'|'ai', content: string}
  const $msgs = () => $("#chat-messages");
  const $form = () => $("#chat-form");
  const $text = () => $("#chat-text");

  function addMsg(content, role) {
    msgs.push({ role, content });
    const m = el("div", `msg ${role}`);
    m.textContent = content;
    $msgs().appendChild(m);
    $msgs().scrollTop = $msgs().scrollHeight;
  }

  function openChat() {
    box.classList.remove("chat-hidden");
    box.classList.add("open");
    setTimeout(() => $text().focus(), 0);
  }
  function closeChat() {
    box.classList.add("chat-hidden");
    box.classList.remove("open");
  }

  // ---- Backend call --------------------------------------------------------
  async function sendToWorker(userText) {
    const history = msgs.map(m => ({ role: m.role, content: m.content }));
    const res = await fetch(CFG.workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText, history })
    });
    return res.json();
  }

  // ---- Wire events ---------------------------------------------------------
  document.addEventListener("click", (e) => {
    if (e.target.closest("#chat-launcher")) openChat();
    if (e.target.closest(".chat-header .close")) closeChat();
  });

  document.addEventListener("input", (e) => {
    if (e.target === $text()) {
      // autosize
      e.target.style.height = "0px";
      e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.target === $text() && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $form().dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

  document.addEventListener("submit", async (e) => {
    if (e.target !== $form()) return;
    e.preventDefault();

    const v = ($text().value || "").trim();
    if (!v) return;

    if (!canSend()) {
      addMsg("Give me a sec — that’s a lot of questions at once. Try again in a moment.", "ai");
      return;
    }

    addMsg(v, "user");
    $text().value = "";
    $text().style.height = "44px";
    markSent();

    if (!CFG.workerUrl) {
      addMsg("My backend isn’t connected yet. Add your Worker URL to config.json → workerUrl.", "ai");
      return;
    }

    try {
      const data = await sendToWorker(v);
      addMsg((data && data.reply) ? data.reply : "I don’t have that info yet, but I can link you to Tony’s portfolio.", "ai");
    } catch (err) {
      console.error("[chat-widget] backend error", err);
      addMsg("Sorry — I’m having trouble reaching my brain.", "ai");
    }
  });

  // ---- Bootstrap after config loads ---------------------------------------
  async function init() {
    await loadConfig();

    // Attach elements once DOM is ready
    document.addEventListener("DOMContentLoaded", () => {
      // Set styles from config
      const root = document.documentElement;
      root.style.setProperty("--chat-accent", CFG.accent);
      root.style.setProperty("--chat-accent-2", darken(CFG.accent, 0.22));

      // Build launcher (avatar)
      launcher.innerHTML = `<img src="${CFG.avatar}" alt="Tony">`;
      document.body.appendChild(launcher);

      // Build box + apply radii (if provided)
      document.body.appendChild(box);
      const radius = String(CFG.radius || "").trim();
      if (radius) {
        box.style.borderRadius = radius;
        const btn = $(".chat-input button", box);
        const ta  = $("#chat-text", box);
        if (btn) btn.style.borderRadius = radius;
        if (ta)  ta.style.borderRadius  = radius;
      }

      // Header title + avatar
      const t = $(".chat-title", box);
      const av = $(".chat-avatar", box);
      if (t) t.textContent = CFG.title || DEFAULTS.title;
      if (av) av.src = CFG.avatar;

      // Greeting
      addMsg(CFG.greeting || DEFAULTS.greeting, "ai");
    });
  }

  init();
})();
