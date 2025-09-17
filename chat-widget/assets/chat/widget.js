/* assets/chat/widget.js — Tony-first-person widget
   - Loads config.json and persona.json
   - Sends {messages} to Worker
   - Accepts OpenAI-style or legacy {reply} responses
*/
(function () {
  const W = window, D = document;
  if (!W.TonyChatWidget) W.TonyChatWidget = {};

  const PATHS = {
    config: "/assets/chat/config.json",
    persona: "/assets/chat/persona.json"
  };

  const SESSION_KEY = "tony_session_v5";
  const GREETED_KEY = "tony_greeted_v5";

  function el(t, c) { const n = D.createElement(t); if (c) n.className = c; return n; }
  async function getJSON(u) { const r = await fetch(u, { cache: "no-store" }); return r.ok ? r.json() : null; }
  function esc(s) { return s.replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

  function buildSystem(conf, persona, isFirst) {
    const guard = [
      "You are Tony speaking in FIRST PERSON. Always use 'I' and 'my'.",
      "Never call yourself a copilot/assistant/AI/bot. You are Tony.",
      isFirst ? "You may introduce yourself once." : "Do not introduce yourself again.",
      "Tone: clear, direct, warm, concise; bullets welcome."
    ].join("\n");

    const extra = Array.isArray(conf.systemPrompt) ? conf.systemPrompt.join("\n") : (conf.systemPrompt || "");

    const tone = persona?.tone ? [
      `VOICE: ${persona.tone.voice || ""}`,
      `RULES: ${(persona.tone.rules || []).join(" • ")}`
    ].join("\n") : "";

    const about = persona?.about_me ? `ABOUT: ${persona.about_me.tagline || ""}; Stack: ${(persona.about_me.stack||[]).join(", ")}` : "";

    const jobs = (persona?.jobs || []).map(j =>
      `• ${j.title} @ ${j.company} (${j.period||""}) – Highlights: ${(j.highlights||[]).join("; ")}`
    ).join("\n");

    const projs = (persona?.projects || []).map(p =>
      `• ${p.name} — ${p.one_liner||""}. Impact: ${p.impact||""}`
    ).join("\n");

    const gaps = (persona?.employment_gaps || []).map(g =>
      `• Gap ${g.period}: ${g.framing}. Proof: ${(g.proof||[]).join("; ")}`
    ).join("\n");

    const portfolio = [about, jobs && ("JOBS:\n"+jobs), projs && ("PROJECTS:\n"+projs), gaps && ("GAPS:\n"+gaps)]
      .filter(Boolean).join("\n\n");

    return [guard, extra, tone, portfolio].filter(Boolean).join("\n\n");
  }

  W.TonyChatWidget.init = async function (opts) {
    const conf = (await getJSON(PATHS.config)) || {};
    const persona = (await getJSON(PATHS.persona)) || {};

    // Basic UI
    const launcher = el("div", "tcw-launcher"); launcher.appendChild(el("span")).textContent = "💬";
    const panel = el("div", "tcw-panel");
    const header = el("div", "tcw-header");
    const title = el("div", "tcw-title"); title.textContent = conf.title || "Chat with Tony";
    header.appendChild(title);

    const body = el("div", "tcw-body");
    const thread = el("div", "tcw-messages"); body.appendChild(thread);

    const bar = el("div", "tcw-inputbar");
    const ta = el("textarea"); ta.placeholder = "Type your question…"; ta.rows = 1;
    const sendBtn = el("button"); sendBtn.textContent = "Send";
    bar.appendChild(ta); bar.appendChild(sendBtn);

    panel.appendChild(header); panel.appendChild(body); panel.appendChild(bar);
    D.body.appendChild(launcher); D.body.appendChild(panel);

    // Style vars
    try {
      const root = D.documentElement;
      if (conf.brand?.accent) root.style.setProperty("--tcw-accent", conf.brand.accent);
      if (conf.brand?.radius) root.style.setProperty("--tcw-radius", conf.brand.radius);
    } catch {}

    // Open/close
    let open = false;
    launcher.onclick = () => { open = !open; panel.style.display = open ? "block" : "none"; if (open) ta.focus(); };

    // Labels
    function bubble(role, text) {
      const row = el("div", "tcw-msg");
      const label = role === "user" ? "You" : "Tony";
      row.innerHTML = `<strong>${label}:</strong> ${esc(text)}`;
      thread.appendChild(row);
      thread.scrollTop = thread.scrollHeight;
    }
    function typing(on) {
      let t = D.getElementById("tcw-typing");
      if (on) {
        if (!t) { t = el("div", "tcw-typing"); t.id = "tcw-typing"; t.textContent = "Tony is typing…"; thread.appendChild(t); }
      } else if (t) t.remove();
      thread.scrollTop = thread.scrollHeight;
    }

    // Session + one-time greeting
    if (!sessionStorage.getItem(SESSION_KEY)) sessionStorage.setItem(SESSION_KEY, crypto.randomUUID());
    if (conf.intro_once && !sessionStorage.getItem(GREETED_KEY) && conf.firstMessage) {
      bubble("assistant", conf.firstMessage);
      sessionStorage.setItem(GREETED_KEY, "1");
    }

    // Collect DOM → messages[]
    function historyToMessages() {
      const nodes = thread.querySelectorAll(".tcw-msg");
      const out = [];
      nodes.forEach(n => {
        const isTony = n.innerHTML.startsWith("<strong>Tony");
        const isUser = n.innerHTML.startsWith("<strong>You");
        if (!isTony && !isUser) return;
        const text = n.textContent.replace(/^You:\s*|^Tony:\s*/i, "").trim();
        const lt = text.toLowerCase();
        if (lt.includes("welcome to tony") && lt.includes("copilot")) return;
        if (lt.includes("i'm your copilot")) return;
        out.push({ role: isTony ? "assistant" : "user", content: text });
      });
      return out;
    }

    // Send
    let lastSend = 0;
    async function send() {
      const v = ta.value.trim();
      if (!v) return;
      if (conf.rateLimit && Date.now() - lastSend < 800) return;
      lastSend = Date.now();

      bubble("user", v);
      ta.value = ""; ta.style.height = "auto";
      typing(true);

      try {
        const hist = historyToMessages();
        const isFirst = hist.length === 0 || (hist.length === 1 && hist[0].role === "assistant");
        const system = buildSystem(conf, persona, isFirst);

        const res = await fetch(conf.proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "system", content: system }, ...hist, { role: "user", content: v }],
            sessionId: sessionStorage.getItem(SESSION_KEY),
            temperature: 0.3
          })
        });

        typing(false);
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          bubble("assistant", "⚠️ Error: Invalid response from server");
          console.error("Proxy error:", txt);
          return;
        }
        // Be ultra-tolerant of response shapes
        const data = await res.json().catch(() => ({}));
        const content =
          data?.choices?.[0]?.message?.content ||
          data?.reply ||
          data?.message ||
          "";
        if (!content) {
          bubble("assistant", "⚠️ Error: Invalid response from server");
          console.error("Unexpected payload:", data);
          return;
        }
        bubble("assistant", content);
      } catch (e) {
        typing(false);
        bubble("assistant", "⚠️ Error: Invalid response from server");
        console.error(e);
      }
    }

    // Enter to send; Shift+Enter newline
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    });
    sendBtn.onclick = send;
  };
})();
