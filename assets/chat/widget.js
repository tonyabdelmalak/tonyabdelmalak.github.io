/* chat-widget/assets/chat/widget.js
   Minimal chat widget with first-person voice and "intro once" behavior.
   - Loads proxyUrl + UI + system rules from config.json
   - Maintains conversation history (no more repeated intros)
   - Client-only greeting bubble (not sent to the model)
*/
(function () {
  const W = window, D = document;
  if (!W.TonyChatWidget) W.TonyChatWidget = {};

  // --- First-person system rules (no repeated intro) ---
  function buildSystemPrompt(isFirstTurn) {
    const lines = [
      "You are Tony speaking in FIRST PERSON. Always use 'I' and 'my'.",
      "Introduce yourself ONLY on the FIRST turn of a NEW session.",
      "Do NOT repeat any welcome/intro on later turns unless explicitly asked 'who are you' or 'what is this?'.",
      "Tone: professional, direct, approachable. Use contractions. Short, active sentences.",
      "If user repeats a broad ask (e.g., 'dashboards'), go deeper (steps, choices, tradeoffs, outcomes) instead of re-introducing.",
      "When asked about dashboards: data sources → prep → modeling → visuals → interactivity → impact.",
      "If context is unclear, ask one focused question, then proceed with best-practice guidance."
    ];
    if (!isFirstTurn) {
      lines.push("This is NOT the first turn of the session; do NOT introduce yourself.");
    }
    return lines.join("\n");
  }

  // --- tiny helpers ---
  function el(tag, cls) { const n = D.createElement(tag); if (cls) n.className = cls; return n; }
  async function getJSON(url) { const r = await fetch(url, { cache: "no-store" }); return r.ok ? r.json() : null; }
  function escapeHTML(s) { return s.replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }

  // --- widget boot ---
  W.TonyChatWidget.init = async function (opts) {
    const o = Object.assign({
      position: "bottom-right",
      mode: "floating",
      avatar: "",
      configPath: "/chat-widget/assets/chat/config.json"
    }, opts || {});

    const conf = (await getJSON(o.configPath)) || {
      proxyUrl: "/chat",
      title: "Ask Tony’s Copilot",
      greeting: "",
      brand: { accent: "#4f46e5", radius: "12px" },
      rateLimit: 10,
      model: "llama3-8b-8192"
    };

    // CSS vars
    try {
      const root = D.documentElement;
      if (conf.brand?.accent) root.style.setProperty("--tcw-accent", conf.brand.accent);
      if (conf.brand?.radius) root.style.setProperty("--tcw-radius", conf.brand.radius);
    } catch (_) {}

    // --- launcher ---
    const launcher = el("div", "tcw-launcher");
    if (o.avatar) {
      const i = el("img"); i.src = o.avatar; i.alt = "Open chat"; launcher.appendChild(i);
    } else {
      const s = el("span"); s.textContent = "💬"; launcher.appendChild(s);
    }
    D.body.appendChild(launcher);

    // --- panel UI ---
    const panel = el("div", "tcw-panel");
    const header = el("div", "tcw-header");
    const av = el("div", "tcw-avatar");
    if (o.avatar) { const i = el("img"); i.src = o.avatar; i.alt = "Avatar"; i.style.width="100%"; i.style.height="100%"; i.style.objectFit="cover"; av.appendChild(i); }
    const title = el("div", "tcw-title"); title.textContent = conf.title || "Copilot";
    header.appendChild(av); header.appendChild(title);

    const body = el("div", "tcw-body");
    const greeting = el("div", "tcw-greeting"); greeting.textContent = conf.greeting || ""; body.appendChild(greeting);
    const thread = el("div", "tcw-messages"); thread.id = "tcw-messages"; body.appendChild(thread);

    const bar = el("div", "tcw-inputbar");
    const textarea = el("textarea"); textarea.placeholder = "Type your question…"; textarea.rows = 1;
    const sendBtn = el("button"); sendBtn.textContent = "Send";
    bar.appendChild(textarea); bar.appendChild(sendBtn);

    panel.appendChild(header); panel.appendChild(body); panel.appendChild(bar);
    D.body.appendChild(panel);

    // position left?
    if (o.position === "bottom-left") {
      launcher.style.right = "auto"; launcher.style.left = "20px";
      panel.style.right = "auto"; panel.style.left = "20px";
    }

    // toggle
    let open = false;
    function toggle() { open = !open; panel.style.display = open ? "block" : "none"; if (open) textarea.focus(); }
    launcher.onclick = toggle;

    // --- message rendering (You / Agent) ---
    function renderMessage(role, text) {
      const row = el("div", "tcw-msg");
      row.innerHTML = `<strong>${role === "user" ? "You" : "Agent"}:</strong> ${escapeHTML(text)}`;
      thread.appendChild(row);
      thread.scrollTop = thread.scrollHeight;
    }

    // typing indicator
    function showTyping() {
      const t = el("div", "tcw-typing"); t.id = "tcw-typing"; t.textContent = "Agent is typing…";
      thread.appendChild(t); thread.scrollTop = thread.scrollHeight;
    }
    function hideTyping() { const t = D.getElementById("tcw-typing"); if (t) t.remove(); }

    // --- history handling ---
    const SESSION_KEY = "tony_agent_session_id_v2";
    const GREETED_KEY = "tony_agent_greeted_v2";
    if (!sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.setItem(SESSION_KEY, crypto.randomUUID());
    }

    function collectHistory() {
      const nodes = thread.querySelectorAll(".tcw-msg");
      const out = [];
      nodes.forEach(n => {
        const isAssistant = n.innerHTML.startsWith("<strong>Agent");
        const isUser = n.innerHTML.startsWith("<strong>You");
        if (!isAssistant && !isUser) return;

        const text = n.textContent.replace(/^You:\s*|^Agent:\s*/i, "").trim();
        const t = text.toLowerCase();
        // strip any legacy canned intros that might be in DOM history
        if (t.includes("welcome to tony") && t.includes("copilot")) return;
        if (t.startsWith("welcome to tony abdelmalak")) return;

        out.push({ role: isAssistant ? "assistant" : "user", content: text });
      });
      return out;
    }

    // one-time client greeting (not sent to model)
    if (conf.intro_once && !sessionStorage.getItem(GREETED_KEY) && conf.firstMessage) {
      renderMessage("assistant", conf.firstMessage);
      sessionStorage.setItem(GREETED_KEY, "1");
    }

    // --- send logic ---
    let lastSendAt = 0;
    async function sendMessage() {
      const v = textarea.value.trim();
      if (!v) return;

      // simple rate limit (client-side)
      if (conf.rateLimit && Date.now() - lastSendAt < 800) return;
      lastSendAt = Date.now();

      renderMessage("user", v);
      textarea.value = "";
      textarea.style.height = "auto";
      showTyping();

      try {
        const history = collectHistory();
        const isFirstTurn = history.length === 0 || (history.length === 1 && history[0].role === "assistant");

        // Build messages array with a single system message up front
        const messages = [
          { role: "system", content: buildSystemPrompt(isFirstTurn) },
          ...history,
          { role: "user", content: v }
        ];

        const res = await fetch(conf.proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            sessionId: sessionStorage.getItem(SESSION_KEY),
            config: conf
          })
        });

        if (!res.ok) {
          hideTyping();
          renderMessage("assistant", "Hmm, I couldn’t reach the service. Please try again.");
          return;
        }

        const data = await res.json().catch(() => ({}));
        const reply = data?.choices?.[0]?.message?.content || data?.reply || data?.message || "OK";
        hideTyping();
        renderMessage("assistant", reply);
      } catch (e) {
        hideTyping();
        renderMessage("assistant", "Network hiccup—please try again.");
        console.error(e);
      }
    }

    // Enter = send, Shift+Enter = newline
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    // autoresize
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 160) + "px";
    });
    sendBtn.onclick = sendMessage;

    // NOTE: no default “hint” bubble here — avoids intro repetition.
  };
})();
