// /assets/chat/widget.js
(function () {
  const W = (window.TonyChatWidget = window.TonyChatWidget || {});
  let mounted = false;

  // Public init
  W.init = function init(opts = {}) {
    if (mounted) return;
    mounted = true;

    const cfg = {
      proxyUrl: opts.proxyUrl,
      systemPrompt: opts.systemPrompt || "",
      // File-based config/persona (optional but supported)
      configUrl: "/assets/chat/config.json",
      systemUrl: "/assets/chat/system.md",
    };

    // Load config + system persona (best effort)
    Promise.all([
      fetch(cfg.configUrl).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch(cfg.systemUrl).then(r => r.ok ? r.text() : "").catch(() => "")
    ]).then(([conf, sysText]) => {
      const ui = {
        title: conf.title || "Copilot",
        greeting: conf.greeting || "How can I help you explore Tony’s journey, dashboards, or career?",
        avatar: conf.avatar || "/assets/img/profile-img.jpg",
        accent: conf.accent || "#4f46e5",
        radius: conf.radius || "12px",
        position: conf.position || "bottom-right",
        rateLimit: Number(conf.rateLimit || 10)
      };
      const persona = (cfg.systemPrompt && cfg.systemPrompt.trim()) ? cfg.systemPrompt : (sysText || "");

      mountUI(ui, cfg, persona);
    }).catch(() => {
      mountUI({}, cfg, cfg.systemPrompt || "");
    });
  };

  function mountUI(ui, cfg, systemPrompt) {
    // Styles (widget.css provides most, this is just CSS vars & fallback)
    const style = document.createElement("style");
    style.textContent = `
      :root {
        --tw-accent: ${ui.accent};
        --tw-radius: ${ui.radius};
      }
    `;
    document.head.appendChild(style);

    // Root
    const root = document.createElement("div");
    root.className = "copilot-container";
    root.innerHTML = `
      <button class="copilot-launch" aria-label="Open chat">
        <img src="${ui.avatar}" alt="Avatar"/>
      </button>
      <div class="copilot-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(ui.title)}">
        <div class="copilot-header">
          <div class="copilot-title">${escapeHtml(ui.title)}</div>
          <button class="copilot-close" aria-label="Close">×</button>
        </div>
        <div class="copilot-body">
          <div class="copilot-msg copilot-agent">${escapeHtml(ui.greeting)}</div>
        </div>
        <div class="copilot-input">
          <input type="text" placeholder="Type your question…" />
          <button class="copilot-send">Send</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const panel = root.querySelector(".copilot-panel");
    const launch = root.querySelector(".copilot-launch");
    const closeBtn = root.querySelector(".copilot-close");
    const body = root.querySelector(".copilot-body");
    const input = root.querySelector(".copilot-input input");
    const send = root.querySelector(".copilot-send");

    // Positioning
    if (ui.position === "bottom-left") {
      root.style.left = "20px";
      root.style.right = "auto";
    }

    // Toggle
    function toggle(open) {
      panel.style.display = open ? "flex" : "none";
      if (open) input.focus();
    }
    launch.addEventListener("click", () => toggle(panel.style.display !== "flex"));
    closeBtn.addEventListener("click", () => toggle(false));

    // Send handler
    async function ask(q) {
      if (!q) return;
      pushMsg(`You: ${q}`, "user");
      input.value = "";
      try {
        const res = await fetch(cfg.proxyUrl, {
          method: "POST",
          headers: {"content-type":"application/json"},
          body: JSON.stringify({
            system: systemPrompt || undefined,
            messages: [{ role: "user", content: q }]
          })
        });
        const data = await res.json();
        const text =
          data.reply ||
          data?.choices?.[0]?.message?.content ||
          data?.message ||
          "…";
        pushMsg(`Copilot: ${text}`, "agent");
      } catch (e) {
        pushMsg("Copilot: (network error)", "agent");
      }
    }

    function pushMsg(html, who) {
      const div = document.createElement("div");
      div.className = "copilot-msg " + (who === "user" ? "copilot-user" : "copilot-agent");
      div.textContent = html;
      // strip "You: " / "Copilot: " labels for cleaner UI, keep content
      div.textContent = html.replace(/^You:\s*/,'').replace(/^Copilot:\s*/,'');
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }

    send.addEventListener("click", () => ask(input.value.trim()));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(input.value.trim()); });
  }

  function escapeHtml(s){return (s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
})();
