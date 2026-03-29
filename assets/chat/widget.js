(() => {
  "use strict";

  const script = document.currentScript || document.querySelector('script[src="/assets/chat/widget.js"]');
  if (script && script.dataset.chat && script.dataset.chat !== "enabled") return;

  const defaults = {
    proxyUrl: "https://my-chat-agent.tonyabdelmalak.workers.dev/chat",
    title: "Ask Tony’s Copilot",
    greeting: "How can I help you explore Tony’s journey, dashboards, or career?",
    brand: { accent: "#4f46e5", radius: "12px" },
    rateLimit: 10,
    model: "llama3-8b-8192"
  };

  const state = { messages: [], sentCount: 0, config: defaults, systemPrompt: "" };
  const ui = {};

  function createUI() {
    const launcher = document.createElement("button");
    launcher.id = "cw-launcher";
    launcher.setAttribute("aria-label", "Open chat");
    launcher.innerHTML = `<div class="cw-avatar-wrap"><img src="/assets/img/tony-chat-avatar-new.jpg" alt="Tony"><div class="cw-launcher-badge" aria-hidden="true"><i></i><i></i><i></i></div></div>`;
    document.body.appendChild(launcher);

    const root = document.createElement("section");
    root.className = "cw-root";
    root.setAttribute("aria-label", "Tony chat");
    root.innerHTML = `
      <header class="cw-header">
        <div class="cw-head"><div class="cw-title"></div></div>
        <button class="cw-close" aria-label="Close chat">&times;</button>
      </header>
      <div class="cw-messages" id="cw-messages"></div>
      <form class="cw-form">
        <textarea class="cw-input" placeholder="Ask Tony's Copilot…" rows="1" required></textarea>
        <button class="cw-send" type="submit" aria-label="Send">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 2 L18 10 L2 18 L2 11 L11 10 L2 9 Z"></path></svg>
        </button>
      </form>`;
    document.body.appendChild(root);

    ui.launcher = launcher;
    ui.root = root;
    ui.title = root.querySelector(".cw-title");
    ui.close = root.querySelector(".cw-close");
    ui.messages = root.querySelector(".cw-messages");
    ui.form = root.querySelector(".cw-form");
    ui.input = root.querySelector(".cw-input");

    launcher.addEventListener("click", () => {
      document.body.classList.add("cw-open");
      root.style.display = "block";
      ui.input.focus();
    });
    ui.close.addEventListener("click", () => {
      document.body.classList.remove("cw-open");
      root.style.display = "none";
    });

    ui.form.addEventListener("submit", onSubmit);
  }

  function addMessage(role, text) {
    const row = document.createElement("div");
    row.className = `cw-row ${role === "user" ? "cw-row-user" : "cw-row-assistant"}`;
    const bubble = document.createElement("div");
    bubble.className = `cw-bubble ${role === "user" ? "cw-bubble-user" : "cw-bubble-assistant"}`;
    bubble.textContent = text;
    row.appendChild(bubble);
    ui.messages.appendChild(row);
    ui.messages.scrollTop = ui.messages.scrollHeight;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const content = ui.input.value.trim();
    if (!content) return;
    if (state.sentCount >= Number(state.config.rateLimit || 10)) {
      addMessage("assistant", "Rate limit reached. Please refresh to start a new chat.");
      return;
    }

    ui.input.value = "";
    addMessage("user", content);
    state.messages.push({ role: "user", content });
    state.sentCount += 1;

    try {
      const resp = await fetch(state.config.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: state.config.model || "llama3-8b-8192",
          temperature: 0.2,
          messages: [
            ...(state.systemPrompt ? [{ role: "system", content: state.systemPrompt }] : []),
            ...state.messages
          ]
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
      const reply = (data && data.content) ? data.content : "I couldn't generate a response.";
      state.messages.push({ role: "assistant", content: reply });
      addMessage("assistant", reply);
    } catch (err) {
      addMessage("assistant", `Sorry — I couldn't reach the chat service (${err.message}).`);
    }
  }

  async function loadRuntimeConfig() {
    try {
      const [configResp, systemResp] = await Promise.all([
        fetch("/assets/chat/config.json", { cache: "no-store" }),
        fetch("/assets/chat/system.md", { cache: "no-store" })
      ]);

      if (configResp.ok) {
        const configData = await configResp.json();
        state.config = { ...defaults, ...configData, brand: { ...defaults.brand, ...(configData.brand || {}) } };
      }
      if (systemResp.ok) state.systemPrompt = await systemResp.text();
    } catch (_) {
      state.config = defaults;
    }

    document.documentElement.style.setProperty("--cw-accent", state.config.brand.accent || defaults.brand.accent);
    document.documentElement.style.setProperty("--cw-radius", state.config.brand.radius || defaults.brand.radius);
    ui.title.textContent = state.config.title || defaults.title;
    addMessage("assistant", state.config.greeting || defaults.greeting);
  }

  createUI();
  loadRuntimeConfig();
})();
