// Minimal, self-contained chat widget (floating launcher + panel)
// - Reads config.json + system.md
// - Textarea input with Enter=send, Shift+Enter=newline
// - Posts to config.proxyUrl (/chat) and shows responses
(function () {
  const W = window, D = document;
  if (!W.TonyChatWidget) W.TonyChatWidget = {};

  // ---------- tiny helpers ----------
  function el(tag, className, attrs) {
    const n = D.createElement(tag);
    if (className) n.className = className;
    if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }
  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { return null; }
  }
  async function fetchTEXT(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } catch (e) { return ""; }
  }

  // ---------- UI bits ----------
  function addMsg(container, role, text) {
    const m = el("div", "tcw-msg " + (role === "user" ? "tcw-user" : "tcw-agent"));
    m.textContent = (role === "user" ? "You: " : "Agent: ") + text;
    container.appendChild(m);
    container.scrollTop = container.scrollHeight;
  }
  function addTyping(container) {
    const wrap = el("div", "tcw-msg tcw-agent");
    const dots = el("span", "tcw-typing");
    dots.textContent = "…";
    wrap.appendChild(dots);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return wrap;
  }

  // ---------- main init ----------
  W.TonyChatWidget.init = async function (opts) {
    const o = Object.assign({
      mode: "floating",
      position: "bottom-right",
      avatar: "",
      configPath: "/chat-widget/assets/chat/config.json",
      systemPath: "/chat-widget/assets/chat/system.md"
    }, opts || {});

    const [cfg, systemPrompt] = await Promise.all([fetchJSON(o.configPath), fetchTEXT(o.systemPath)]);
    const conf = cfg || {
      title: "Ask Tony’s Copilot",
      greeting: "Hi — I’m Tony’s Copilot. Want a quick tour, dashboards, or résumé?",
      brand: { accent: "#4f46e5", radius: "12px" },
      proxyUrl: "https://my-chat-agent.tonyabdelmalak.workers.dev/chat"
    };

    // CSS vars (safe if not defined)
    try {
      const root = D.documentElement;
      if (conf.brand?.accent) root.style.setProperty("--tcw-accent", conf.brand.accent);
      if (conf.brand?.radius) root.style.setProperty("--tcw-radius", conf.brand.radius);
    } catch (_) {}

    // Launcher
    const launcher = el("div", "tcw-launcher");
    if (o.avatar) {
      const img = el("img");
      img.src = o.avatar; img.alt = "Chat with Tony";
      launcher.appendChild(img);
    } else {
      const s = el("span");
      s.textContent = "💬";
      launcher.appendChild(s);
    }
    D.body.appendChild(launcher);

    // Panel
    const panel = el("div", "tcw-panel");
    const header = el("div", "tcw-header");
    const av = el("div", "tcw-avatar");
    if (o.avatar) {
      const i = el("img");
      i.src = o.avatar; i.alt = "Tony";
      i.style.width = "100%"; i.style.height = "100%"; i.style.objectFit = "cover";
      av.appendChild(i);
    }
    const ttl = el("div", "tcw-title");
    ttl.textContent = conf.title || "Ask Tony’s Copilot";
    header.appendChild(av); header.appendChild(ttl);

    const body = el("div", "tcw-body");
    const greet = el("div", "tcw-greeting");
    greet.textContent = conf.greeting || "Hi — I’m Tony’s Copilot. Want a quick tour, dashboards, or résumé?";
    body.appendChild(greet);

    // Quick chips
    const chips = el("div", "tcw-chips");
    ["Show dashboards", "Career pivot", "Résumé"].forEach(label => {
      const chip = el("div", "tcw-chip");
      chip.textContent = label;
      chip.onclick = () => {
        textarea.value = label;
        autoResize();
        sendMessage(); // send immediately when a chip is clicked
      };
      chips.appendChild(chip);
    });
    body.appendChild(chips);

    // Starter note
    addMsg(body, "assistant", "Ask about Tony’s dashboards, projects, or career pivot.");

    // Input bar (TEXTAREA + Send)
    const bar = el("div", "tcw-inputbar");
    const textarea = el("textarea", null, { placeholder: "Type your question…" });
    const sendBtn = el("button", "tcw-send-btn");
    sendBtn.textContent = "Send";
    bar.appendChild(textarea);
    bar.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(bar);
    D.body.appendChild(panel);

    // Open/close
    let open = false;
    function toggle() {
      open = !open;
      panel.style.display = open ? "block" : "none";
      if (open) textarea.focus();
    }
    launcher.onclick = toggle;
    if (o.position === "bottom-left") {
      launcher.style.right = "auto"; launcher.style.left = "20px";
      panel.style.right = "auto"; panel.style.left = "20px";
    }

    // State for chat history
    const history = []; // {role, content} pairs

    // Autosize + IME-safe Enter handling
    let composing = false;
    const maxHeightPx = 160;
    function autoResize() {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, maxHeightPx) + "px";
    }
    textarea.addEventListener("compositionstart", () => { composing = true; });
    textarea.addEventListener("compositionend", () => { composing = false; });
    textarea.addEventListener("input", autoResize);
    // initial kick
    autoResize();

    textarea.addEventListener("keydown", (e) => {
      if (composing) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
      // Shift+Enter falls through (newline)
    });

    sendBtn.onclick = () => sendMessage();

    async function sendMessage() {
      const text = (textarea.value || "").trim();
      if (!text) return;

      // Append user message
      addMsg(body, "user", text);
      history.push({ role: "user", content: text });
      textarea.value = "";
      autoResize();

      // Typing indicator
      const typingEl = addTyping(body);

      // Build request
      const payload = {
        message: text,
        history,               // send running context (your Worker can ignore or use)
        system: systemPrompt || ""
      };

      // POST to proxy
      let replyText = "";
      try {
        const r = await fetch(conf.proxyUrl || "/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const data = await r.json().catch(() => ({}));
        // Expected shape: { reply: "text" }  (your Worker’s echo mode returns a simple message)
        replyText = data.reply || data.message || data.text || "OK";
      } catch (err) {
        replyText = "Sorry — I couldn’t reach the chat service. Please try again.";
      }

      // Replace typing with reply
      typingEl.remove();
      addMsg(body, "assistant", replyText);
      history.push({ role: "assistant", content: replyText });
    };
  };

  // Optional: auto-init if script is included directly
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => W.TonyChatWidget.init && W.TonyChatWidget.init());
  } else {
    W.TonyChatWidget.init && W.TonyChatWidget.init();
  }
})();
