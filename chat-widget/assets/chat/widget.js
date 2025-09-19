// Minimal, dependency-free widget.
// Exposes window.TonyChatWidget.init({ avatar, configPath, systemPath, position, mode })

(function () {
  const AGENT_LABEL = "Tony";      // Consistent name in the transcript
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

  // Debounce utility
  function debounce(fn, wait = 700) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  const Widget = {
    state: {
      config: null,
      systemPrompt: "",
      open: false,
      inFlight: false
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

      // Toast area for soft error messages
      this.toastEl = el("div", "copilot-toast copilot-hidden");

      inputRow.append(this.input, send);

      this.root.append(header, this.messages, inputRow, this.toastEl);

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

      // send actions (debounced)
      const debouncedSend = debounce(() => this.handleSend(), 700);
      this.sendBtn.addEventListener("click", debouncedSend);
      this.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          debouncedSend();
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
    showToast(msg) {
      if (!this.toastEl) return;
      this.toastEl.textContent = msg;
      this.toastEl.classList.remove("copilot-hidden");
      setTimeout(() => this.toastEl.classList.add("copilot-hidden"), 4000);
    },

    async handleSend() {
      if (this.state.inFlight) return; // single-flight guard

      const message = (this.input.value || "").trim();
      if (!message) return;
      this.addUser(message);
      this.input.value = "";
      this.state.inFlight = true;
      this.sendBtn.disabled = true;

      try {
        const reply = await this.callProxy(message);
        this.addAgent(reply);
      } catch (err) {
        this.showToast(err.userMessage || "⚠️ Busy right now, please try again in a few seconds.");
        this.addAgent(`⚠️ ${err.message || "Failed to fetch"}`);
      } finally {
        this.state.inFlight = false;
        this.sendBtn.disabled = false;
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
        // try parse structured error
        let userMessage = "";
        try {
          const err = await res.json();
          if (err.userMessage) userMessage = err.userMessage;
        } catch {}
        const detail = await res.text().catch(() => "");
        const error = new Error(`HTTP ${res.status}`);
        error.userMessage = userMessage || null;
        error.detail = detail;
        throw error;
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
