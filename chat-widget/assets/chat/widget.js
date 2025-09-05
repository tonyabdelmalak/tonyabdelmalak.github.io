// chat-widget/assets/chat/widget.js
class CopilotWidget {
  constructor(config) {
    this.config = config;
    this.systemPersona = `... your persona text here ...`; // keep same persona
  }

  init() {
    this.buildUI();
    this.addEvents();
  }

  buildUI() {
    this.container = document.createElement("div");
    this.container.className = "copilot-container";

    this.container.innerHTML = `
      <div class="copilot-header">
        <img src="${this.config.avatar}" class="copilot-avatar" />
        <span class="copilot-title">Copilot</span>
      </div>
      <div class="copilot-messages"></div>
      <div class="copilot-input">
        <input type="text" placeholder="Type your question..." />
        <button aria-label="Send"></button>
      </div>
    `;

    document.body.appendChild(this.container);
    this.messagesEl = this.container.querySelector(".copilot-messages");
    this.inputEl = this.container.querySelector("input");
    this.buttonEl = this.container.querySelector("button");
  }

  addEvents() {
    this.buttonEl.addEventListener("click", () => this.sendMessage());
    this.inputEl.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.sendMessage();
    });
  }

  addMessage(sender, text) {
    const msg = document.createElement("div");
    msg.className = `copilot-msg ${sender}`;
    msg.textContent = `${sender === "user" ? "You" : "Agent"}: ${text}`;
    this.messagesEl.appendChild(msg);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  async sendMessage() {
    const message = this.inputEl.value.trim();
    if (!message) return;

    this.addMessage("user", message);
    this.inputEl.value = "";

    try {
      const res = await fetch(this.config.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: this.systemPersona,
          message,
        }),
      });

      const data = await res.json();
      this.addMessage("agent", data.reply || "…");
    } catch (err) {
      this.addMessage("agent", "⚠️ Error: " + err.message);
    }
  }
}

// Auto-init
window.CopilotWidget = CopilotWidget;
