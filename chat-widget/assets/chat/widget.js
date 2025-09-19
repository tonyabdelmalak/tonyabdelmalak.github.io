// Sleek wave widget — dependency-free
// Exposes: window.TonyChatWidget.init({ avatar, configPath, systemPath })

(function () {
  const AGENT_LABEL = "Tony";
  const SESSION_FLAG = "copilot_greeted";

  function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }
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

  const Widget = {
    state: { config: null, systemPrompt: "", open: false },

    async init(opts) {
      this.opts = Object.assign(
        {
          avatar: "",
          configPath: "/chat-widget/assets/chat/config.json",
          systemPath: "/chat-widget/assets/chat/system.md"
        },
        opts || {}
      );

      const [config, systemText] = await Promise.all([
        fetchJSON(this.opts.configPath),
        fetchText(this.opts.systemPath)
      ]);
      this.state.config = config;
      this.state.systemPrompt = systemText;

      this.build();
      this.attachEvents();

      if (!sessionStorage.getItem(SESSION_FLAG) && config.greeting) {
        this.addAgent(config.greeting);
        if (Array.isArray(config.quickReplies) && config.quickReplies.length) {
          this.renderChips(config.quickReplies);
        }
        sessionStorage.setItem(SESSION_FLAG, "1");
      }
    },

    build() {
      // Theme vars (can be overridden in config.json)
      document.documentElement.style.setProperty("--copilot-accent", this.state.config.accent || "#1e3a8a");
      document.documentElement.style.setProperty("--copilot-accent-2", this.state.config.accent2 || "#3b82f6");
      document.documentElement.style.setProperty("--copilot-radius", this.state.config.radius || "22px");

      // Launcher
      this.launch = el("button", "copilot-launch");
      const avatarImg = el("img");
      avatarImg.src = this.opts.avatar || (this.state.config.brand?.avatar ?? "");
      avatarImg.alt = "Open chat";
      this.launch.appendChild(avatarImg);

      // Panel
      this.root = el("section", "copilot-container copilot-hidden");

      // Header
      const header = el("header", "copilot-header");
      const headerRow = el("div", "copilot-header-row");
      const avatar = el("img", "copilot-avatar");
      avatar.src = this.opts.avatar || (this.state.config.brand?.avatar ?? "");
      avatar.alt = "Avatar";

      const titleWrap = el("div", "copilot-title-wrap");
      const title = el("div", "copilot-title", this.state.config.title || "Chat with Tony");
      const subtitle = el("div", "copilot-subtitle", this.state.config.subtitle || "We are online!");
      titleWrap.append(title, subtitle);

      const closeBtn = el("button", "copilot-close", "×");
      closeBtn.setAttribute("aria-label", "Close chat");

      headerRow.append(avatar, titleWrap);
      header.append(headerRow, closeBtn);

      // Messages + chips
      this.messages = el("div", "copilot-messages");
      this.chipsWrap = el("div", "copilot-chips");

      // Input row
      const inputRow = el("div", "copilot-input-row");
      this.input = el("input", "copilot-input");
      this.input.type = "text";
      this.input.placeholder = this.state.config.placeholder || "Enter your message...";
      const send = el("button", "copilot-send", "➤");
      send.setAttribute("title", "Send");

      inputRow.append(this.input, send);
      this.root.append(header, this.messages, this.chipsWrap, inputRow);
      document.body.append(this.launch, this.root);

      // refs
      this.closeBtn = closeBtn;
      this.sendBtn = send;
    },

    attachEvents() {
      this.launch.addEventListener("click", () => this.showPanel());
      this.closeBtn.addEventListener("click", () => this.hidePanel());
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

    addAgent(text) {
      const row = el("div", "copilot-msg agent");
      const bubble = el("div", "bubble", text);
      row.append(bubble);
      this.messages.append(row);
      this.scrollToBottom();
    },
    addUser(text) {
      const row = el("div", "copilot-msg user");
      const bubble = el("div", "bubble", text);
      row.append(bubble);
      this.messages.append(row);
      this.scrollToBottom();
    },
    renderChips(items) {
      this.chipsWrap.innerHTML = "";
      items.slice(0, 6).forEach((label) => {
        const chip = el("button", "copilot-chip", label);
        chip.addEventListener("click", () => {
          this.input.value = label;
          this.handleSend();
        });
        this.chipsWrap.append(chip);
      });
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
        if (Array.isArray(this.state.config.quickReplies) && this.state.config.quickReplies.length) {
          this.renderChips(this.state.config.quickReplies);
        }
      } catch (err) {
        this.addAgent(`⚠️ Error: ${err.message || "Failed to fetch"}`);
      }
    },

    async callProxy(message) {
      const url = this.state.config.proxyUrl;
      if (!url) throw new Error("Missing proxyUrl in config.json");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, system: this.state.systemPrompt })
      });
      if (!res.ok) {
        let body = "";
        try { body = await res.text(); } catch {}
        throw new Error(`HTTP ${res.status} – ${body || res.statusText}`);
      }
      const data = await res.json();
      if (!data || typeof data.reply !== "string") throw new Error("Invalid response from server");
      return data.reply;
    }
  };

  window.TonyChatWidget = { init: (opts) => Widget.init(opts) };
})();
