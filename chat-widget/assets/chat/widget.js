// Chat Widget — /chat-widget/assets/chat/widget.js  v4-safe
// Secrets:
//  * "Jerry's shiny shoes"  -> role_active:friend_desi_des
//  * "I love my Wally boy"  -> role_active:friend_susie
// Features: switching, secret scrubbing, exact greetings, session persistence, safe guards.

(function () {
  "use strict";
  const VERSION = "v4-safe";
  try { console.log("[CW]", VERSION); } catch {}

  /* ===================== Defaults ===================== */
  const DEFAULTS = {
    workerUrl: "https://my-chat-agent.tonyabdelmalak.workers.dev/chat",
    systemUrl: "/chat-widget/assets/chat/system.md",
    kbUrl: "/chat-widget/assets/chat/about-tony.md",
    model: "llama-3.1-8b-instant",
    temperature: 0.25,
    title: "Hi, I'm Tony. What's on your mind?",
    subtitle: "",
    brand: { accent: "#2f3a4f", radius: "18px" },
    greeting:
      "I'm happy to answer your questions about my background, specific projects/dashboards, or what I’m currently working towards.",
    maxHistory: 16,
    avatarUrl: "/assets/img/profile-img.jpg",
    persistHistory: false,
    storageKey: "tony-cw-history",
    typingDelayMs: 0,
    launcherAnchor: "#about",
    launcherMode: "fixed"
  };

  /* ===================== State ===================== */
  let CFG = null;
  const UI = {};
  let HISTORY = [];
  let OPEN = false;
  let BUSY = false;
  let greetingShown = false;
  let detachFns = [];
  let activePersona = null;

  try {
    activePersona = sessionStorage.getItem("cwPersonaActive") || null;
  } catch { activePersona = null; }

  /* ===================== Utils ===================== */
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const setVar = (n, v) => { try { document.documentElement.style.setProperty(n, v); } catch {} };
  const on = (el, ev, fn, opts) => { if (!el) return; el.addEventListener(ev, fn, opts); detachFns.push(() => el.removeEventListener(ev, fn, opts)); };
  const scrollPane = () => { if (UI.pane) UI.pane.scrollTop = UI.pane.scrollHeight; };
  const growInput = () => { const el = UI.input; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; };
  function stripGreeting(t) {
    let s = String(t || "").trim();
    s = s.replace(/^(?:hi|hello|hey|howdy|greetings)[^.\n!?]*[.!?]\s*/i, "");
    s = s.replace(/^i['’]m\s+tony[^.\n!?]*[.!?]\s*/i, "");
    return s.trim();
  }

  /* ===================== Markdown ===================== */
  function sanitizeBlocks(html) {
    try {
      const doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html");
      ["script","style","iframe","object","embed","link"].forEach(sel => doc.querySelectorAll(sel).forEach(n => n.remove()));
      doc.querySelectorAll("a").forEach(a => { a.setAttribute("rel","noopener noreferrer"); a.setAttribute("target","_blank"); });
      return doc.body.firstChild.innerHTML;
    } catch { return html; }
  }
  function mdToHtml(input) {
    let s = esc(String(input || "")).replace(/\r\n/g, "\n");
    s = s.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_,lang,code)=>`<pre><code${lang?` class="language-${lang.toLowerCase()}"`:""}>${code.replace(/</g,"&lt;")}</code></pre>`);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/^\s*#{1,6}\s*(.+)$/gm, "<strong>$1</strong>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
    s = s.replace(/$begin:math:display$([^$end:math:display$]+)\]$begin:math:text$(https?:\\/\\/[^\\s)]+)$end:math:text$/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/^(?:\d+\.)\s+.+(?:\n\d+\.\s+.+)*/gm, list => `<ol>${list.split("\n").map(l=>l.replace(/^\d+\.\s+(.+)$/,"<li>$1</li>")).join("")}</ol>`);
    s = s.replace(/^(?:-\s+|\*\s+).+(?:\n(?:-\s+|\*\s+).+)*/gm, list => `<ul>${list.split("\n").map(l=>l.replace(/^(?:-\s+|\*\s+)(.+)$/,"<li>$1</li>")).join("")}</ul>`);
    const blocks = s.split(/\n{2,}/).map(b => /^<(ul|ol|pre|blockquote|strong)/.test(b.trim()) ? b : `<p>${b.replace(/\n/g,"<br>")}</p>`);
    return sanitizeBlocks(blocks.join(""));
  }

  /* ===================== History ===================== */
  const loadHistory = () => {
    if (!CFG || !CFG.persistHistory) return;
    try {
      const raw = localStorage.getItem(CFG.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data)) HISTORY = data.slice(-CFG.maxHistory);
    } catch {}
  };
  const saveHistory = () => {
    if (!CFG || !CFG.persistHistory) return;
    try { localStorage.setItem(CFG.storageKey, JSON.stringify(HISTORY.slice(-CFG.maxHistory))); } catch {}
  };

  /* ===================== UI ===================== */
  function buildLauncher() {
    try {
      const btn = document.createElement("button");
      btn.id = "cw-launcher";
      btn.setAttribute("aria-label","Open chat");
      btn.style.position = "fixed"; btn.style.right = "24px"; btn.style.bottom = "16px";
      btn.innerHTML =
        `<div class="cw-avatar-wrap" style="width:56px;height:56px;border-radius:28px;overflow:hidden;box-shadow:0 6px 14px rgba(0,0,0,.18);border:0;">
           <img src="${esc((CFG && CFG.avatarUrl) || "/assets/img/profile-img.jpg")}" alt="Tony Avatar" style="width:100%;height:100%;object-fit:cover">
         </div>`;
      document.body.appendChild(btn);
      UI.launcher = btn;
      on(btn, "click", openChat);
    } catch (e) { try { console.error("[CW] launcher error:", e); } catch {} }
  }

  function buildRoot() {
    const root = document.createElement("div");
    root.className = "cw-root";
    root.setAttribute("role","dialog");
    root.setAttribute("aria-modal","true");
    root.setAttribute("aria-label","Tony Chat");
    root.style.display = "none";
    root.innerHTML =
      `<div class="cw-header" style="background:#2f3a4f;color:#fff;padding:12px 16px;border-top-left-radius:12px;border-top-right-radius:12px">
         <div class="cw-title" style="font-weight:700">${esc(CFG.title)}</div>
         ${CFG.subtitle ? `<div class="cw-subtitle" style="opacity:.9">${esc(CFG.subtitle)}</div>` : ""}
         <button class="cw-close" aria-label="Close" title="Close" style="position:absolute;right:8px;top:6px;background:transparent;border:0;color:#fff;font-size:24px;cursor:pointer">&times;</button>
       </div>
       <div class="cw-messages" id="cw-messages" role="log" aria-live="polite" style="background:#f7f8fb;padding:12px;max-height:50vh;overflow:auto"></div>
       <form class="cw-form" novalidate style="display:flex;gap:8px;padding:8px;background:#fff;border-bottom-left-radius:12px;border-bottom-right-radius:12px">
         <textarea id="cw-input" class="cw-input" rows="1" aria-label="Message input" placeholder="Type a message..." style="flex:1;resize:none;border:1px solid #cfd3df;border-radius:12px;padding:10px 12px"></textarea>
         <button type="submit" id="cw-send" class="cw-send" aria-label="Send" title="Send" style="border:0;background:#2f3a4f;color:#fff;border-radius:12px;padding:0 14px">▶</button>
       </form>`;
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;right:24px;bottom:88px;width:360px;max-width:92vw;border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.2);overflow:hidden;background:#fff;z-index:999999;";
    wrap.appendChild(root);
    document.body.appendChild(wrap);

    UI.rootWrap = wrap;
    UI.root = root;
    UI.close = root.querySelector(".cw-close");
    UI.pane = root.querySelector("#cw-messages");
    UI.form = root.querySelector(".cw-form");
    UI.input = root.querySelector("#cw-input");
    UI.send = root.querySelector("#cw-send");

    on(UI.close, "click", closeChat);
    on(UI.form, "submit", onSubmit);
    on(UI.input, "keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); UI.form.requestSubmit(); } });
    on(UI.input, "input", growInput);
  }

  function addAssistant(text) {
    const row = document.createElement("div");
    row.className = "cw-row cw-row-assistant";
    const bubble = document.createElement("div");
    bubble.className = "cw-bubble cw-bubble-assistant";
    bubble.style.cssText = "background:#2f3a4f;color:#fff;border-radius:14px 14px 14px 4px;padding:10px 12px;margin:8px 0;white-space:pre-wrap";
    bubble.innerHTML = mdToHtml(text);
    row.appendChild(bubble);
    UI.pane.appendChild(row);
    scrollPane();
  }
  function addUser(text) {
    const row = document.createElement("div");
    row.className = "cw-row cw-row-user";
    const bubble = document.createElement("div");
    bubble.className = "cw-bubble cw-bubble-user";
    bubble.style.cssText = "background:#e9edf7;color:#182033;border-radius:14px 14px 4px 14px;padding:10px 12px;margin:8px 0;white-space:pre-wrap";
    bubble.textContent = text;
    row.appendChild(bubble);
    UI.pane.appendChild(row);
    scrollPane();
  }
  function addTyping() {
    const row = document.createElement("div");
    row.className = "cw-row cw-row-assistant cw-typing";
    const b = document.createElement("div");
    b.className = "cw-bubble cw-bubble-assistant";
    b.style.cssText = "background:#2f3a4f;color:#fff;border-radius:14px 14px 14px 4px;padding:10px 12px;margin:8px 0;";
    b.innerHTML = '<span class="cw-dots"><i>•••</i></span>';
    row.appendChild(b);
    UI.pane.appendChild(row);
    scrollPane();
    return { remove: () => row.remove() };
  }

  /* ===================== Transport ===================== */
  function makePayload(userText) {
    const recent = HISTORY.slice(-((CFG && CFG.maxHistory) || 16));
    const msgs = recent.concat([{ role: "user", content: userText }]);
    if (activePersona) msgs.unshift({ role: "system", content: `role_active:${activePersona}` });
    if (greetingShown && !recent.some(m => m.role === "user")) {
      msgs.unshift({ role: "system", content: "UI already displayed a greeting. Answer directly without re-greeting." });
    }
    return {
      model: (CFG && CFG.model) || "llama-3.1-8b-instant",
      temperature: (CFG && CFG.temperature) || 0.25,
      messages: msgs,
      systemUrl: (CFG && CFG.systemUrl) || "/chat-widget/assets/chat/system.md",
      kbUrl: (CFG && CFG.kbUrl) || "/chat-widget/assets/chat/about-tony.md"
    };
  }

  async function sendToWorker(userText) {
    const url = (CFG && CFG.workerUrl) || "https://my-chat-agent.tonyabdelmalak.workers.dev/chat";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makePayload(userText))
    });
    const ok = r.ok;
    let data = null, txt = "";
    try { data = await r.json(); } catch { txt = await r.text(); }
    if (!ok) throw new Error((data && data.error) || txt || ("HTTP " + r.status));
    const content = data?.content || data?.reply || data?.choices?.[0]?.message?.content || "";
    return content || "I couldn’t generate a reply just now.";
  }

  /* ===================== Secrets: robust detect/scrub ===================== */
  const RX_SUSIE = /\bi\s*love\s*my\s*wally\s*boy\b[\s.!?]*$/iu;
  const RX_DES   = /jerry[’']s\s*shiny\s*shoes\b[\s.!?]*$/iu;

  function detectPersona(text) {
    const t = String(text || "");
    if (RX_SUSIE.test(t)) return "friend_susie";
    if (RX_DES.test(t))   return "friend_desi_des";
    return null;
  }
  function scrubSecrets(text) {
    let s = String(text || "");
    s = s.replace(RX_SUSIE, "").replace(RX_DES, "");
    s = s.replace(/\s{2,}/g, " ").trim();
    if (!s || /^[\.\,\!\?\;\:\-$begin:math:text$$end:math:text$$begin:math:display$$end:math:display$\s]+$/.test(s)) return "";
    return s;
  }

  /* ===================== Submit ===================== */
  async function onSubmit(e) {
    try {
      e.preventDefault();
      if (BUSY) return;

      const original = (UI.input.value || "").trim();
      if (!original) return;

      const prev = activePersona;
      const detected = detectPersona(original);
      if (detected) {
        activePersona = detected;
        try { sessionStorage.setItem("cwPersonaActive", activePersona); } catch {}
      }

      const text = scrubSecrets(original);

      if (text) {
        addUser(text);
        HISTORY.push({ role: "user", content: text });
        saveHistory();
      }
      UI.input.value = "";
      growInput();

      if (detected && prev !== activePersona) {
        let greet = "";
        if (activePersona === "friend_desi_des") {
          greet =
            "What it be like Desi Des?\n\n" +
            "- I appreciate you and love you. You’re family, my ride or die.\n" +
            "- How balmy is your house right now?\n\n" +
            "Tell me what’s up and I’ll roll with you.";
        } else if (activePersona === "friend_susie") {
          greet =
            "Hi! I love my Susieeee!!!! I miss you. Since we don't talk often, you can chat with me here.\n\n" +
            "- I appreciate you and love you. You’re family, my ride or die.\n" +
            "- What do you plan to eat next?\n\n" +
            "Catch me up and let’s dive in.";
        }
        addAssistant(greet);
        HISTORY.push({ role: "assistant", content: greet });
        saveHistory();
        scrollPane();
        if (!text) return; // secret-only
      }

      const typing = addTyping();
      BUSY = true; UI.send.disabled = true;
      try {
        let reply = await sendToWorker(text || "");
        reply = stripGreeting(reply) || reply;
        if (CFG && CFG.typingDelayMs > 0) await new Promise(r => setTimeout(r, CFG.typingDelayMs));
        addAssistant(reply);
        HISTORY.push({ role: "assistant", content: reply });
        saveHistory();
      } catch (err) {
        try { console.error("[CW] send error:", err); } catch {}
        addAssistant("Sorry — I ran into an error. Please try again.");
      } finally {
        typing.remove();
        BUSY = false; UI.send.disabled = false;
        scrollPane();
      }
    } catch (e2) {
      try { console.error("[CW] submit error:", e2); } catch {}
    }
  }

  /* ===================== Open/Close ===================== */
  function openChat() {
    try {
      if (OPEN) return;
      OPEN = true;
      UI.rootWrap.style.display = "block";
      if (CFG.greeting && !greetingShown) {
        addAssistant(CFG.greeting);
        HISTORY.push({ role: "assistant", content: CFG.greeting });
        saveHistory();
        greetingShown = true;
      }
      UI.input.focus(); scrollPane();
    } catch (e) { try { console.error("[CW] open error:", e); } catch {} }
  }
  function closeChat() {
    try {
      if (!OPEN) return;
      OPEN = false;
      UI.rootWrap.style.display = "none";
    } catch (e) { try { console.error("[CW] close error:", e); } catch {} }
  }

  /* ===================== Boot ===================== */
  async function init() {
    try {
      // show launcher ASAP even if config fails
      buildLauncher();

      // fetch config with cache-bust to avoid stale
      let cfg = {};
      try {
        const r = await fetch("/chat-widget/assets/chat/config.json?ts=" + Date.now(), { cache: "no-store" });
        cfg = r.ok ? await r.json() : {};
      } catch {}
      CFG = Object.assign({}, DEFAULTS, cfg || {});
      if (CFG.brand?.accent) setVar("--cw-accent", CFG.brand.accent);
      if (CFG.brand?.radius) setVar("--cw-radius", CFG.brand.radius);

      loadHistory();
      buildRoot(); // attach main UI
    } catch (err) {
      try { console.error("[CW] init error:", err); } catch {}
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
