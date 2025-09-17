/* assets/chat/widget.js — Tony-first-person widget
   Loads config and persona, builds chat UI, shows one-time greeting, sends chat messages to proxy.
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

  async function getJSON(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) return r.json();
    } catch (err) {}
    return null;
  }
  function el(tag, cls) {
    const n = D.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  }

  function buildSystem(conf, persona, isFirst) {
    const guard = [
      "You are Tony speaking in FIRST PERSON. Always use 'I' and 'my'.",
      "Never call yourself a copilot/assistant/AI/bot. You are Tony.",
      isFirst ? "You may introduce yourself once." : "Do not introduce yourself again.",
      "Tone: clear, direct, warm, concise; bullets welcome."
    ].join("\n");

    const extra = Array.isArray(conf.systemPrompt) ? conf.systemPrompt.join("\n") : (conf.systemPrompt || "");

    // Tone
    let tone = "";
    if (persona && persona.tone) {
      tone = [
        `VOICE: ${persona.tone.voice || ""}`,
        `RULES: ${(persona.tone.rules || []).join(" • ")}`,
        persona.tone.signature_phrases && persona.tone.signature_phrases.length ? `SIGNATURE: ${(persona.tone.signature_phrases||[]).join(" | ")}` : ""
      ].join("\n");
    }

    // About
    let about = "";
    if (persona && persona.about_me) {
      about = `ABOUT: ${persona.about_me.tagline || ""}; Stack: ${(persona.about_me.stack || []).join(", ")}`;
    }

    // Jobs
    let jobs = "";
    if (persona && Array.isArray(persona.jobs)) {
      jobs = persona.jobs.map(j => {
        const highlights = (j.highlights || []).join("; ");
        return `• ${j.title} @ ${j.company} (${j.period || ""}) – Highlights: ${highlights}`;
      }).join("\n");
      if (jobs) jobs = "JOBS:\n" + jobs;
    }

    // Projects
    let projs = "";
    if (persona && Array.isArray(persona.projects)) {
      projs = persona.projects.map(p => {
        return `• ${p.name} — ${p.one_liner || ""}. Impact: ${p.impact || ""}`;
      }).join("\n");
      if (projs) projs = "PROJECTS:\n" + projs;
    }

    // Gaps
    let gaps = "";
    if (persona && Array.isArray(persona.employment_gaps)) {
      gaps = persona.employment_gaps.map(g => {
        const proof = (g.proof || []).join("; ");
        return `• Gap ${g.period}: ${g.framing}. Proof: ${proof}.`;
      }).join("\n");
      if (gaps) gaps = "GAPS:\n" + gaps;
    }

    // FAQs
    let faqs = "";
    if (persona && Array.isArray(persona.faqs)) {
      faqs = persona.faqs.map(f => `Q: ${f.q}\nA: ${f.a}`).join("\n");
      if (faqs) faqs = "FAQs:\n" + faqs;
    }

    const portfolio = [about, jobs, projs, gaps, faqs].filter(Boolean).join("\n\n");

    return [guard, extra, tone, portfolio].filter(Boolean).join("\n\n");
  }

  W.TonyChatWidget.init = async function (opts) {
    const conf = (await getJSON(PATHS.config)) || {};
    const persona = (await getJSON(PATHS.persona)) || {};

    // Build UI
    const launcher = el("div", "tcw-launcher");
    launcher.textContent = "💬";
    const panel = el("div", "tcw-panel");
    panel.style.display = "none";
    const header = el("div", "tcw-header");
    const title = el("div", "tcw-title");
    title.textContent = conf.title || "Chat with Tony";
    header.appendChild(title);
    const body = el("div", "tcw-body");
    const messages = el("div", "tcw-messages");
    body.appendChild(messages);
    const inputbar = el("div", "tcw-inputbar");
    const ta = el("textarea");
    ta.placeholder = "Type your question…";
    ta.rows = 1;
    const sendBtn = el("button");
    sendBtn.textContent = "Send";
    inputbar.appendChild(ta);
    inputbar.appendChild(sendBtn);
    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(inputbar);
    D.body.appendChild(launcher);
    D.body.appendChild(panel);

    // Apply brand styles
    try {
      const root = D.documentElement;
      if (conf.brand && conf.brand.accent) root.style.setProperty("--tcw-accent", conf.brand.accent);
      if (conf.brand && conf.brand.radius) root.style.setProperty("--tcw-radius", conf.brand.radius);
    } catch (e) {}

    // Position
    if (opts && opts.position === "bottom-left") {
      launcher.style.right = "auto";
      launcher.style.left = "20px";
      panel.style.right = "auto";
      panel.style.left = "20px";
    }

    // Toggle
    let open = false;
    launcher.onclick = () => {
      open = !open;
      panel.style.display = open ? "flex" : "none";
      if (open) ta.focus();
    };

    // Render message
    function bubble(role, text) {
      const row = el("div", "tcw-msg");
      const label = role === "user" ? "You" : "Tony";
      row.innerHTML = `<strong>${label}:</strong> ${esc(text)}`;
      messages.appendChild(row);
      messages.scrollTop = messages.scrollHeight;
    }

    // Typing indicator
    function typing(on) {
      let t = D.getElementById("tcw-typing");
      if (on) {
        if (!t) {
          t = el("div", "tcw-typing");
          t.id = "tcw-typing";
          t.textContent = "Tony is typing…";
          messages.appendChild(t);
        }
      } else if (t) {
        t.remove();
      }
      messages.scrollTop = messages.scrollHeight;
    }

    // First-time greeting
    if (conf.intro_once && !sessionStorage.getItem(GREETED_KEY) && conf.firstMessage) {
      bubble("assistant", conf.firstMessage);
      sessionStorage.setItem(GREETED_KEY, "1");
    }

    function historyToMessages() {
      const nodes = messages.querySelectorAll(".tcw-msg");
      const out = [];
      nodes.forEach(n => {
        const isTony = n.innerHTML.startsWith("<strong>Tony");
        const isUser = n.innerHTML.startsWith("<strong>You");
        if (!isTony && !isUser) return;
        const text = n.textContent.replace(/^You:\s*|^Tony:\s*/i, "").trim();
        out.push({ role: isTony ? "assistant" : "user", content: text });
      });
      return out;
    }

    // Send message
    let lastSend = 0;
    async function send() {
      const value = ta.value.trim();
      if (!value) return;
      if (conf.rateLimit && Date.now() - lastSend < 800) return;
      lastSend = Date.now();
      bubble("user", value);
      ta.value = "";
      ta.style.height = "auto";
      typing(true);

      try {
        const hist = historyToMessages();
        const isFirst = hist.length === 0 || (hist.length === 1 && hist[0].role === "assistant");
        const systemPrompt = buildSystem(conf, persona, isFirst);
        let sessionId = sessionStorage.getItem(SESSION_KEY);
        if (!sessionId) {
          sessionId = crypto.randomUUID();
          sessionStorage.setItem(SESSION_KEY, sessionId);
        }
        const res = await fetch(conf.proxyUrl || "/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              { role: "system", content: systemPrompt },
              ...hist,
              { role: "user", content: value }
            ],
            sessionId: sessionId,
            config: conf
          })
        });
        typing(false);
        if (!res.ok) {
          bubble("assistant", "Sorry—service error.");
          return;
        }
        const data = await res.json().catch(() => ({}));
        const content = data?.choices?.[0]?.message?.content || data?.reply || data?.message || "";
        bubble("assistant", content);
      } catch (err) {
        typing(false);
        bubble("assistant", "Network error. Please try again.");
      }
    }

    // Send on Enter
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    });
    sendBtn.onclick = send;
  };
})();
