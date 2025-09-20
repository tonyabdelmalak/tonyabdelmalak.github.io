// Minimal, dependency-free widget.
// Exposes window.TonyChatWidget.init({ avatar, configPath, systemPath, position, mode })

(function () {
  const AGENT_LABEL = "Agent";      // Consistent name in the transcript
  const SESSION_FLAG = "copilot_greeted"; // Per-tab; resets when tab closes

  // Utility: build elements quickly
  function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  // Load JSON/MD
  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    return res.text();
  }
  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    return res.json();
  }

  // Widget
  const Widget = {
    state: {
      config: null,
      systemPrompt: "",
      open: false
    },

    async init(opts) {
      // options
      this.opts = Object.assign(
        {
          mode: "floating",
          position: "bottom-right",
          avatar: "",
          configPath: "/chat-widget/assets/chat/config.json",
          systemPath: "/chat-widget/assets/chat/system.md"
        },
        opts || {}
      );

      // load config + system prompt
      const [config, systemText] = await Promise.all([
        fetchJSON(this.opts.configPath),
        fetchText(this.opts.systemPath)
      ]);
      this.state.config = config;
      this.state.systemPrompt = systemText;

      // build DOM
      this.build();
      this.attachEvents();

      // greeting only once per browser tab
      if (!sessionStorage.getItem(SESSION_FLAG) && config.greeting) {
        this.addAgent(config.greeting);
        sessionStorage.setItem(SESSION_FLAG, "1");
      }
    },

    build() {
      // Launcher
      this.launch = el("button", "copilot-launch");
      const avatarImg = el("img");
      avatarImg.src = this.opts.avatar || (this.state.config.brand?.avatar ?? "");
      avatarImg.alt = "Open chat";
      this.launch.appendChild(avatarImg);

      // Panel
      this.root = el("section", "copilot-container copilot-hidden");

      // Header with Close (×)
      const header = el("header", "copilot-header");
      const avatar = el("img", "copilot-avatar");
      avatar.src = this.opts.avatar || (this.state.config.brand?.avatar ?? "");
      avatar.alt = "Avatar";
      const title = el("div", "copilot-title", (this.state.config.title || "Copilot"));
      const closeBtn = el("button", "copilot-close", "&times;");
      closeBtn.setAttribute("aria-label", "Close chat");
      header.append(avatar, title, closeBtn);

      // Messages
      this.messages = el("div", "copilot-messages");

      // Input row
      const inputRow = el("div", "copilot-input-row");
      this.input = el("input", "copilot-input");
      this.input.type = "text";
      this.input.placeholder = this.state.config.placeholder || "Type your question...";
      const send = el("button", "copilot-send", "↥");
      send.setAttribute("title", "Send");

      inputRow.append(this.input, send);

      this.root.append(header, this.messages, inputRow);

      // Mount both
      document.body.append(this.launch, this.root);

      // local refs
      this.closeBtn = closeBtn;
      this.sendBtn = send;
    },

    attachEvents() {
      // open/close
      this.launch.addEventListener("click", () => this.showPanel());
      this.closeBtn.addEventListener("click", () => this.hidePanel());

      // send actions
      this.sendBtn.addEventListener("click", () => this.handleSend());
      this.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.handleSend();
        }
      });
    },

    showPanel() {
      this.launch.classList.add("copilot-hidden");
      this.root.classList.remove("copilot-hidden");
      this.state.open = true;
      setTimeout(() => this.input?.focus(), 10);
    },
    hidePanel() {
      this.root.classList.add("copilot-hidden");
      this.launch.classList.remove("copilot-hidden");
      this.state.open = false;
    },

    // UI helpers
    addAgent(text) {
      const row = el("div", "copilot-msg agent");
      row.append(
        el("span", "copilot-label", `${AGENT_LABEL}:`),
        document.createTextNode(" " + text)
      );
      this.messages.append(row);
      this.scrollToBottom();
    },
    addUser(text) {
      const row = el("div", "copilot-msg user");
      row.append(
        el("span", "copilot-label", "You:"),
        document.createTextNode(" " + text)
      );
      this.messages.append(row);
      this.scrollToBottom();
    },
    scrollToBottom() {
      this.messages.scrollTop = this.messages.scrollHeight;
    },

    async handleSend() {
      const message = (this.input.value || "").trim();
      if (!message) return;
      this.addUser(message);
      this.input.value = "";

      try {
        const reply = await this.callProxy(message);
        this.addAgent(reply);
      } catch (err) {
        this.addAgent(`⚠️ Error: ${err.message || "Failed to fetch"}`);
      }
    },

    // Calls your Cloudflare Worker (/chat) specified in config.json
    async callProxy(message) {
      const url = this.state.config.proxyUrl;
      if (!url) throw new Error("Missing proxyUrl in config.json");

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          system: this.state.systemPrompt
        })
      });

      if (!res.ok) {
        let body = "";
        try { body = await res.text(); } catch {}
        throw new Error(`HTTP ${res.status} – ${body || res.statusText}`);
      }

      const data = await res.json();
      if (!data || typeof data.reply !== "string") {
        throw new Error("Invalid response from server");
      }
      return data.reply;
    }
  };

  // public init
  window.TonyChatWidget = {
    init: (opts) => Widget.init(opts)
  };
})();


NEW WIDGET FORMATTING CODE FOR WIDGET.JS:

/* ==========================================================================
   Chat Widget — Stylesheet
   Path: /chat-widget/assets/chat/widget.css
   Notes:
   - Uses CSS vars so JS can set --accent and --radius from config.json
   - Works on light/dark pages; all colors are self-contained
   - Avoids clashing with site styles via .tw-chat- root namespace
   ========================================================================== */

:root {
  --tw-chat-accent: #4f46e5;       /* overridden by config.accent */
  --tw-chat-radius: 12px;          /* overridden by config.radius */
  --tw-chat-bg: #ffffff;
  --tw-chat-fg: #0f172a;           /* slate-900 */
  --tw-chat-muted: #475569;        /* slate-600 */
  --tw-chat-soft: #f8fafc;         /* slate-50 */
  --tw-chat-line: #e2e8f0;         /* slate-200 */
  --tw-chat-shadow: 0 10px 30px rgba(2, 6, 23, .12);
  --tw-chat-shadow-lg: 0 20px 45px rgba(2, 6, 23, .16);
  --tw-chat-blur: blur(10px);
}

.tw-chat-hidden { display: none !important; }

/* ----------
   Launcher (FAB)
   ---------- */
.tw-chat-fab {
  position: fixed;
  right: 22px;
  bottom: 22px;
  width: 64px;
  height: 64px;
  border-radius: 999px;
  background: var(--tw-chat-accent);
  color: #fff;
  display: grid;
  place-items: center;
  box-shadow: var(--tw-chat-shadow-lg);
  cursor: pointer;
  z-index: 2147483647;
  transition: transform .2s ease, box-shadow .2s ease, filter .2s ease;
}
.tw-chat-fab:active { transform: scale(.97); }
.tw-chat-fab:hover { filter: brightness(1.05); }

/* ----------
   Container
   ---------- */
.tw-chat {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: clamp(320px, 34vw, 420px);
  max-height: min(78vh, 760px);
  display: flex;
  flex-direction: column;
  background: var(--tw-chat-bg);
  color: var(--tw-chat-fg);
  border-radius: var(--tw-chat-radius);
  box-shadow: var(--tw-chat-shadow-lg);
  overflow: hidden;
  z-index: 2147483646;
  border: 1px solid var(--tw-chat-line);
  backdrop-filter: var(--tw-chat-blur);
}

/* ----------
   Header
   ---------- */
.tw-chat-header {
  padding: 12px 14px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--tw-chat-accent) 22%, #ffffff) 0%,
    #ffffff 100%
  );
  border-bottom: 1px solid var(--tw-chat-line);
}
.tw-chat-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  letter-spacing: .2px;
}
.tw-chat-close {
  margin-left: auto;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: var(--tw-chat-accent);
  background: #fff;
  border: 1px solid var(--tw-chat-line);
  cursor: pointer;
  transition: transform .15s ease, filter .15s ease;
}
.tw-chat-close:hover { filter: brightness(1.03); }
.tw-chat-close:active { transform: scale(.96); }

.tw-chat-sub {
  margin-top: 6px;
  font-size: 13px;
  color: var(--tw-chat-muted);
}

/* ----------
   Body / messages
   ---------- */
.tw-chat-body {
  display: flex;
  flex-direction: column;
  min-height: 140px;
  max-height: 100%;
  overflow: hidden;
}

.tw-chat-scroll {
  flex: 1 1 auto;
  overflow: auto;
  background:
    radial-gradient(60% 45% at 100% -10%, rgba(79,70,229,.07), transparent 60%),
    linear-gradient(180deg, #fff, #fff);
  padding: 14px;
  scroll-behavior: smooth;
}

/* Scrollbar (WebKit) */
.tw-chat-scroll::-webkit-scrollbar { width: 10px; }
.tw-chat-scroll::-webkit-scrollbar-thumb {
  background: #e5e7eb;
  border-radius: 999px;
}
.tw-chat-scroll::-webkit-scrollbar-thumb:hover { background: #d1d5db; }

.tw-chat-msg {
  display: flex;
  margin: 8px 0;
}

.tw-chat-bubble {
  max-width: 92%;
  padding: 10px 12px;
  border-radius: calc(var(--tw-chat-radius) + 6px);
  border: 1px solid var(--tw-chat-line);
  background: #fff;
  box-shadow: var(--tw-chat-shadow);
  font-size: 15px;
  line-height: 1.45;
}

.tw-chat-msg.you   { justify-content: flex-end; }
.tw-chat-msg.agent { justify-content: flex-start; }
.tw-chat-msg.you   .tw-chat-bubble {
  color: #fff;
  background: var(--tw-chat-accent);
  border-color: color-mix(in srgb, var(--tw-chat-accent) 75%, #ffffff);
}
.tw-chat-msg.agent .tw-chat-bubble {
  background: #fff;
}

/* Bots first help card (greeting) */
.tw-chat-greeting {
  padding: 12px 14px;
  border-radius: calc(var(--tw-chat-radius) + 6px);
  border: 1px solid var(--tw-chat-line);
  background: var(--tw-chat-soft);
  color: var(--tw-chat-fg);
  box-shadow: var(--tw-chat-shadow);
  font-size: 15px;
  line-height: 1.5;
}

/* ----------
   Suggestions / chips
   ---------- */
.tw-chat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 4px;
}
.tw-chat-chip {
  appearance: none;
  border: 1px solid var(--tw-chat-line);
  background: #fff;
  color: var(--tw-chat-fg);
  font: inherit;
  font-size: 13px;
  padding: 8px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, transform .1s ease;
  box-shadow: var(--tw-chat-shadow);
}
.tw-chat-chip:hover {
  background: var(--tw-chat-soft);
  border-color: color-mix(in srgb, var(--tw-chat-accent) 30%, var(--tw-chat-line));
}
.tw-chat-chip:active { transform: translateY(1px); }

/* ----------
   Composer
   ---------- */
.tw-chat-composer {
  position: relative;
  border-top: 1px solid var(--tw-chat-line);
  padding: 10px;
  background: #fff;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}

.tw-chat-input {
  width: 100%;
  min-height: 44px;
  max-height: 140px;
  resize: none;
  padding: 12px 14px;
  line-height: 1.35;
  border-radius: calc(var(--tw-chat-radius) + 2px);
  border: 1px solid var(--tw-chat-line);
  outline: none;
  font: inherit;
  box-shadow: var(--tw-chat-shadow);
  background: #fff;
}

.tw-chat-send {
  appearance: none;
  padding: 0 18px;
  min-width: 90px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tw-chat-accent) 75%, #ffffff);
  background: var(--tw-chat-accent);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--tw-chat-shadow);
  transition: filter .15s ease, transform .1s ease;
}
.tw-chat-send:hover { filter: brightness(1.05); }
.tw-chat-send:active { transform: translateY(1px); }

.tw-chat-note {
  grid-column: 1 / -1;
  margin-top: 2px;
  font-size: 12px;
  color: var(--tw-chat-muted);
}

/* ----------
   Mini errors
   ---------- */
.tw-chat-error {
  grid-column: 1 / -1;
  margin: 6px 2px 2px;
  padding: 10px 12px;
  border-radius: calc(var(--tw-chat-radius) + 4px);
  border: 1px solid #fecaca;             /* red-200 */
  background: #fff1f2;                   /* rose-50 */
  color: #7f1d1d;                        /* red-900 */
  font-size: 13px;
  box-shadow: var(--tw-chat-shadow);
}

/* ----------
   Utility
   ---------- */
.tw-chat-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tw-chat-muted);
  background: #fff;
  border: 1px solid var(--tw-chat-line);
  padding: 6px 8px;
  border-radius: 999px;
  box-shadow: var(--tw-chat-shadow);
}

/* ----------
   Responsive
   ---------- */
@media (max-width: 520px) {
  .tw-chat {
    right: 10px;
    left: 10px;
    width: auto;
    bottom: 12px;
    max-height: 82vh;
  }
  .tw-chat-fab {
    right: 14px;
    bottom: 14px;
    width: 58px; height: 58px;
  }
}

/* ----------
   Live overrides from JS:
   JS sets:
     document.documentElement.style.setProperty('--tw-chat-accent', config.accent)
     document.documentElement.style.setProperty('--tw-chat-radius', config.radius)
   ---------- */


WIDGET.CSS CODE:

/* ===== Container ===== */
.copilot-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 340px;
  max-height: 560px;
  display: flex;
  flex-direction: column;
  border: 1px solid #dcdcdc;
  border-radius: 14px;
  background: #fff;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  font-size: 14px;
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
  overflow: hidden;
  z-index: 2147483000 !important; /* always on top */
}

/* ===== Header ===== */
.copilot-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f7f8fa;
  border-bottom: 1px solid #e8e8e8;
}

.copilot-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.copilot-title {
  font-weight: 700;
  font-size: 15px;
  color: #0f172a;
  flex: 1 1 auto;
}

/* Close (X) button in header */
.copilot-close {
  appearance: none;
  border: none;
  background: transparent;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  line-height: 28px;
  color: #64748b;
}
.copilot-close:hover { background: #eef2f7; color: #334155; }

/* ===== Messages area ===== */
.copilot-messages {
  flex: 1 1 auto;
  padding: 12px;
  overflow-y: auto;
  background: #fff;
}

/* One extra space between turns for readability */
.copilot-msg {
  margin: 0 0 12px 0;           /* <— space between bubbles */
  line-height: 1.45;
  word-wrap: break-word;
}

/* Label (“Agent:” / “You:”) — bold + color-coded */
.copilot-label {
  font-weight: 700;              /* <— bold the speaker */
  margin-right: 6px;
}

.copilot-msg.agent .copilot-label { color: #4338ca; } /* indigo */
.copilot-msg.user  .copilot-label { color: #2563eb; } /* blue   */

/* Optional subtle background for Agent to help scan */
.copilot-msg.agent {
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  padding: 8px 10px;
}

/* ===== Input row ===== */
.copilot-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid #e8e8e8;
  background: #fff;
}

.copilot-input {
  flex: 1 1 auto;
  height: 42px;
  border: 1px solid #d1d5db;
  border-radius: 9999px;
  padding: 0 14px;
  font-size: 14px;
  outline: none;
}
.copilot-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99,102,241,.18);
}

/* Send button — circle with upward arrow */
.copilot-send {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: #6366f1;      /* indigo */
  color: #fff;
  font-size: 18px;
  cursor: pointer;
}
.copilot-send:hover { background: #4f46e5; }

/* ===== Launcher (floating button) ===== */
.copilot-launch {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: #6366f1;
  box-shadow: 0 10px 28px rgba(0,0,0,.22);
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 2147483000 !important;
}

.copilot-launch img {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,.9);
}

.copilot-hidden { display: none !important; }


CONFIG.JSON:

{
  "workerUrl": "https://my-chat-agent.tonyabdelmalak.workers.dev/chat",
  "systemUrl": "/chat-widget/assets/chat/system.md",
  "model": "llama-3.1-8b-instant",
  "temperature": 0.2,
  "title": "What's on your mind?",
  "greeting": "Hi, I’m Tony. Ask me about my background, dashboards, projects, or what I’m building next.",
  "accent": "#4f46e5",
  "radius": "14px",
  "rateLimit": 10
}







{
  "proxyUrl": "https://my-chat-agent.tonyabdelmalak.workers.dev/chat",
  "title": "Ask Tony’s Copilot",
  "brand": {
    "accent": "#4f46e5",
    "radius": "12px"
  },

  "model": "llama3-8b-8192",
  "rateLimit": 10,

  "intro_once": true,
  "firstMessage": "Hey—I’m Tony. I use AI and analytics to turn workforce data into action. Ask me about my dashboards, projects, or career.",
  "greeting": "",

  "systemPrompt": [
    "You are Tony speaking in FIRST PERSON. Always use “I” and “my”.",
    "Introduce yourself ONLY on the FIRST turn of a NEW session. Never repeat the welcome unless explicitly asked \"who are you\" or \"what is this\".",
    "If the user repeats a broad ask (e.g., “dashboards”), do NOT reintroduce yourself. Instead, go deeper: explain steps, choices, tradeoffs, and outcomes.",
    "Tone: professional, direct, approachable. Use contractions. Short, active sentences.",
    "Emphasize value and results: e.g., “I automated X to save Y hours per week.”",
    "When asked about dashboards, default to a concrete example with steps: data sources → prep → modeling → visuals → interactivity → impact.",
    "If context is unclear, ask one focused question, then continue with a best-practice answer."
  ]
}
--
--

// worker.js — Cloudflare Worker for GROQ chat with strict CORS + persona support

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin") || "";
      const cors = buildCorsHeaders(origin, env);

      // Preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "content-type, authorization",
            "Access-Control-Max-Age": "86400"
          }
        });
      }

      // Health
      if (url.pathname === "/health") {
        return json({ ok: true, ts: Date.now() }, 200, cors);
      }

      // Config
      if (url.pathname === "/config") {
        return json(
          {
            allowedOrigins: getAllowedOrigins(env),
            model: env.GROQ_MODEL || "llama-3.1-8b-instant",
            temperature: Number(env.TEMPERATURE ?? 0.2),
          },
          200,
          cors
        );
      }

      // Chat
      if (url.pathname === "/chat" && request.method === "POST") {
        if (!isOriginAllowed(origin, env)) {
          return json({ error: "Forbidden origin", origin }, 403, cors);
        }
        if (!env.GROQ_API_KEY) {
          return json({ error: "Missing GROQ_API_KEY secret" }, 500, cors);
        }

        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400, cors);
        }

        const userMsg = (body?.message ?? "").toString().slice(0, 4000);
        const system   = (body?.system  ?? "").toString().slice(0, 12000); // <— persona
        const history  = Array.isArray(body?.history) ? body.history.slice(-6) : [];

        if (!userMsg) {
          return json({ error: "Empty message" }, 400, cors);
        }

        const messages = [];
        if (system) messages.push({ role: "system", content: system }); // persona injected here
        for (const m of history) {
          if (m && typeof m === "object" && typeof m.content === "string" && m.role) {
            messages.push({ role: m.role, content: m.content });
          }
        }
        messages.push({ role: "user", content: userMsg });

        const model = env.GROQ_MODEL || "llama-3.1-8b-instant";
        const temperature = Number(env.TEMPERATURE ?? (typeof body.temperature === 'number' ? body.temperature : 0.2));

        let groqRes;
        try {
          groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.GROQ_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              temperature,
              messages,
              stream: false
            })
          });
        } catch (err) {
          return json({ error: "Network to GROQ failed", detail: String(err) }, 502, cors);
        }

        if (!groqRes.ok) {
          const detail = await safeJson(groqRes);
          return json({ error: "GROQ error", status: groqRes.status, detail }, 502, cors);
        }

        const data = await groqRes.json();
        const text =
          data?.choices?.[0]?.message?.content ??
          data?.choices?.[0]?.text ?? "";

        return json({ text }, 200, cors);
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      return new Response(JSON.stringify({ error: "Worker crashed", detail: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  },
};

/* ---------------- helpers ---------------- */

function getAllowedOrigins(env) {
  const raw = (env.ALLOWED_ORIGINS || "").trim();
  if (!raw) return [];
  return raw.split(/[, \n]+/).map(s => s.trim()).filter(Boolean);
}

function isOriginAllowed(origin, env) {
  if (!origin) return false;
  return getAllowedOrigins(env).includes(origin);
}

function buildCorsHeaders(origin, env) {
  const headers = { "Vary": "Origin" };
  if (origin && isOriginAllowed(origin, env)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function safeJson(res) {
  try { return await res.json(); }
  catch {
    try { return await res.text(); }
    catch { return null; }
  }
}




WIDGET.CSS WIDGET FORMATTING CODE:



WORKER.JS CODE THAT WORKS:

// worker.js — Copilot proxy (OpenAI first, fallback to Groq)

const SYSTEM_PROMPT = `
You are Tony’s Copilot — a friendly, concise guide for tonyabdelmalak.github.io.
Priorities:
1) Help visitors understand Tony’s work, dashboards, and background.
2) If asked for private/sensitive info, decline and point to public resources.
3) Keep replies brief (≤60 words) unless returning code. Use short sentences/bullets.
4) No medical/legal/financial advice—suggest a professional.

Style: Warm, expert, no fluff. If unsure, say so. One smart follow-up max.

Background:
Tony Abdelmalak is a People & Business Insights Analyst who pivoted into AI-driven HR analytics.
He uses Tableau, SQL, and Python to turn workforce/business data into exec-ready insights.
Projects include turnover analysis, early turnover segmentation, and workforce planning models.
He’s based in Los Angeles and aims to lead AI initiatives in HR analytics.
`.trim();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Chat endpoint
    if (url.pathname === "/chat" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        const userMsg = (body?.message || "").toString().trim();
        const history = Array.isArray(body?.history) ? body.history : [];

        if (!userMsg) {
          return new Response(
            JSON.stringify({ error: "Missing 'message' in request body." }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        // Decide provider: OpenAI if available, else Groq
        const hasOpenAI = !!env.OPENAI_API_KEY;
        const hasGroq = !!env.GROQ_API_KEY;

        if (!hasOpenAI && !hasGroq) {
          return new Response(
            JSON.stringify({ error: "No model provider configured (set OPENAI_API_KEY or GROQ_API_KEY)." }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        // Normalize history (optional)
        const past = history
          .filter(m => m && m.role && m.content)
          .map(m => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-12); // keep it light

        const messages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...past,
          { role: "user", content: userMsg }
        ];

        // Build request for the chosen provider
        let apiUrl, headers, payload;

        if (hasOpenAI) {
          apiUrl = "https://api.openai.com/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          };
          payload = {
            model: "gpt-4o-mini",
            messages,
            temperature: 0.3,
            max_tokens: 200,
          };
        } else {
          apiUrl = "https://api.groq.com/openai/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          };
          payload = {
            model: "llama-3.1-8b-instant",
            messages,
            temperature: 0.3,
            max_tokens: 200,
          };
        }

        const resp = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const txt = await resp.text();
          return new Response(
            JSON.stringify({ error: "Upstream error", status: resp.status, details: txt }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        const data = await resp.json();
        const reply = data?.choices?.[0]?.message?.content?.trim() || "Sorry—no response was generated.";

        return new Response(JSON.stringify({ reply }), {
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: "Server error", details: String(err) }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
