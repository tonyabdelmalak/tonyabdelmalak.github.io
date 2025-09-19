
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
