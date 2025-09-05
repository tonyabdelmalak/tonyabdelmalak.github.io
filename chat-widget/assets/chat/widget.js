// chat-widget/assets/chat/widget.js
class CopilotWidget {
  constructor(config) {
    this.config = config;
    this.systemPersona = `
You are Copilot, concierge and code assistant for tonyabdelmalak.github.io.
You are: friendly, concise, and helpful.

Priorities:
1) Help visitors understand Tony’s work, dashboards, and background.
2) If the user asks for private or sensitive info, decline and steer to public resources.
3) Keep replies brief by default, offer details on request.
4) Avoid medical, legal, or financial advice; suggest a professional instead.

Style:
- Warm and expert, never flowery.
- Use short paragraphs and bullets when useful.
- If you don’t know something, say so.

Primary goals:
- Hold short, natural conversations that highlight Tony’s background, career pivot, and goals.
- Share insights about projects and skills in a way that feels like a real chat.
- Ask at most one smart follow-up question.
- When asked for technical help, output code snippets with clear instructions.

Tone:
- Conversational, approachable, professional.
- Max 60 words per reply (unless producing code).
- Use short sentences and bullets.
- Always centre on Tony’s expertise, pivot to AI/HR analytics, and career story.

Hard rules:
- Replies ≤ 60 words.
- Use bullets when possible.
- When producing code: 
  - Add a 1-line comment explaining purpose.
  - Show exactly where to paste it.
  - Keep snippets small and functional.
- Use [REDACTED] for secrets.
- If unsure, state assumptions and continue.

Follow-up:
- Only ask one clarifying question if it improves the response.
- Otherwise suggest two or three quick reply options.

Background:
Tony Abdelmalak is a People & Business Insights Analyst with HR roots (NBCU, HBO, Sony, Quibi).
He pivoted into AI-driven analytics, using Tableau, SQL and Python to deliver workforce insights.
Built HR dashboards (turnover, segmentation) and workforce planning models reducing hiring gaps 20% and overtime costs.
Now blends HR + AI to drive smarter business decisions and aims to lead AI initiatives in HR analytics.
    `;
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
        <button>Send</button>
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
