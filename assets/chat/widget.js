/* chat-widget/assets/chat/widget.js
   Minimal chat widget with “You / Agent” labels and embedded system persona.
   - Loads proxyUrl + brand from config.json
   - Enter = send, Shift+Enter = newline
   - Sends { message, system } to your Cloudflare Worker
*/
(function () {
  const W = window, D = document;
  if (!W.TonyChatWidget) W.TonyChatWidget = {};

  // --- Tony’s Copilot — system persona (embedded) ---
  const SYSTEM_PROMPT = `
You are Tony’s Copilot, concierge and code assistant for tonyabdelmalak.github.io, his public website.
You are: friendly, concise, and helpful.

Priorities:
1) Help visitors understand Tony’s work, dashboards, and background.
2) If the user asks for private or sensitive info, decline and steer to public resources.
3) Keep replies brief by default, offer details on request.
4) Avoid medical, legal, or financial advice; instead, suggest speaking to a professional.

Style:
- Warm and expert, never flowery.
- Use short paragraphs and bullets when useful.
- If you don’t know something, say so.

Primary goals (in order):
- Hold short, natural conversations that highlight Tony’s background, career pivot, and goals.
- Share insights about projects and skills in a way that feels like a real chat.
- Ask at most one smart follow-up question.
- When asked for technical help, output code snippets (HTML/CSS/JS) with clear instructions.

Tone & style:
- Conversational, approachable, professional.
- Max 60 words per reply (unless producing code).
- Use short sentences and bullets to avoid heavy blocks of text.
- Always center on Tony’s expertise, pivot to AI/HR analytics, and career story.

Hard rules:
- Replies ≤ 60 words.
- Use bullets when possible.
- When producing code:
  - Add a 1-line comment explaining purpose.
  - Show exactly where to paste it.
  - Keep snippets small and functional.
- Use [REDACTED] for secrets.
- If unsure, state assumptions and continue.

Follow-up behaviour:
- Only ask one clarifying question if it improves the response.
- If unnecessary, skip and suggest two or three quick reply options.

Background context:
Tony Abdelmalak is a People & Business Insights Analyst with a solid foundation in HR through experience at NBCU, HBO, Sony and Quibi. He pivoted into AI-driven analytics, using tools like Tableau, SQL and Python to transform workforce and business data into executive-ready insights. Tony built HR dashboards (e.g. turnover analysis, early turnover segmentation) and workforce planning models that reduced hiring gaps by 20% and cut overtime costs. He now blends HR expertise with data science to help organizations make smarter decisions and aims to lead AI initiatives in HR analytics.
`.trim();

  // --- tiny helpers ---
  function el(tag, cls) { const n = D.createElement(tag); if (cls) n.className = cls; return n; }
  async function getJSON(url) { const r = await fetch(url, { cache: "no-store" }); return r.ok ? r.json() : null; }

  // --- widget boot ---
  W.TonyChatWidget.init = async function (opts) {
    const o = Object.assign({
      position: "bottom-right",
      mode: "floating",
      avatar: "", // path to jpg/png
      configPath: "/chat-widget/assets/chat/config.json"
    }, opts || {});

    const conf = (await getJSON(o.configPath)) || {
      proxyUrl: "/chat", title: "Copilot", greeting: "Hi — how can I help?",
      brand: { accent: "#4f46e5", radius: "12px" }, rateLimit: 10
    };

    // CSS vars
    try {
      const root = D.documentElement;
      if (conf.brand?.accent) root.style.setProperty("--tcw-accent", conf.brand.accent);
      if (conf.brand?.radius) root.style.setProperty("--tcw-radius", conf.brand.radius);
    } catch (_) { /* noop */ }

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
    const greeting = el("div", "tcw-greeting"); greeting.textContent = conf.greeting || "Hi — how can I help?"; body.appendChild(greeting);

    const messages = el("div", "tcw-messages"); messages.id = "tcw-messages"; body.appendChild(messages);

    const bar = el("div", "tcw-inputbar");
    const textarea = el("textarea"); textarea.placeholder = "Type your question…"; textarea.rows = 1;
    const sendBtn = el("button"); sendBtn.textContent = "Send";
    bar.appendChild(textarea); bar.appendChild(sendBtn);

    panel.appendChild(header); panel.appendChild(body); panel.appendChild(bar);
    D.body.appendChild(panel);

    // position left?
    if (o.position === "bottom-left") { launcher.style.right = "auto"; launcher.style.left = "20px"; panel.style.right = "auto"; panel.style.left = "20px"; }

    // toggle
    let open = false;
    function toggle() { open = !open; panel.style.display = open ? "block" : "none"; if (open) textarea.focus(); }
    launcher.onclick = toggle;

    // --- message rendering (ONLY "You" / "Agent") ---
    function renderMessage(sender, text) {
      const row = el("div", "tcw-msg");
      row.innerHTML = `<strong>${sender === "user" ? "You" : "Agent"}:</strong> ${escapeHTML(text)}`;
      messages.appendChild(row);
      messages.scrollTop = messages.scrollHeight;
    }
    function escapeHTML(s) { return s.replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }

    // typing indicator
    function showTyping() {
      const t = el("div", "tcw-typing"); t.id = "tcw-typing"; t.textContent = "Agent is typing…";
      messages.appendChild(t); messages.scrollTop = messages.scrollHeight;
    }
    function hideTyping() { const t = D.getElementById("tcw-typing"); if (t) t.remove(); }

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
        const r = await fetch(conf.proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: v,
            system: SYSTEM_PROMPT,   // ← inject updated persona on every request
            mode: "echo-or-model"    // your Worker can choose echo or upstream model
          })
        });

        let reply = "";
        if (r.ok) {
          const data = await r.json().catch(() => ({}));
          reply = data.reply || data.message || "OK";
        } else {
          reply = "Hmm, I couldn’t reach the service. Please try again.";
        }
        hideTyping();
        renderMessage("agent", reply);
      } catch (e) {
        hideTyping();
        renderMessage("agent", "Network hiccup—please try again.");
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

    // first hint
    renderMessage("agent", "Hi! Ask about Tony’s projects, dashboards, or career pivot.");
  };
})();
