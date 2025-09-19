// Tony Copilot - widget.js (v3)
// Lightweight loader with inline-persona support (no external system.md required)

(function () {
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  async function readConfig(path) {
    if (!path) return {};
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) return {};
      return await res.json();
    } catch {
      return {};
    }
  }

  function buildUI(cfg) {
    const container = el("div", "copilot-container");
    const launch = el("button", "copilot-launch");
    const panel = el("div", "copilot-panel");
    const header = el("div", "copilot-header", cfg.title || "Copilot");
    const body = el("div", "copilot-body");
    const inputRow = el("div", "copilot-input");
    const input = el("input");
    input.placeholder = "Type a message...";
    const send = el("button", null, "Send");

    body.insertAdjacentHTML(
      "beforeend",
      `<div class="copilot-msg">${cfg.greeting || "How can I help?"}</div>`
    );

    inputRow.appendChild(input);
    inputRow.appendChild(send);
    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(inputRow);
    container.appendChild(launch);
    container.appendChild(panel);
    document.body.appendChild(container);

    // Toggle open/close
    function open() {
      panel.style.display = "flex";
    }
    function close() {
      panel.style.display = "none";
    }
    launch.addEventListener("click", () => {
      const openNow = panel.style.display !== "flex";
      openNow ? open() : close();
    });

    // Send handler
    async function ask(text) {
      const q = (text || "").trim();
      if (!q) return;

      body.insertAdjacentHTML("beforeend", `<div class="copilot-msg"><b>You:</b> ${escapeHtml(q)}</div>`);
      input.value = "";

      try {
        const res = await fetch(cfg.proxyUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: q }],
            system: cfg.system || null,   // inline persona
            temperature: 0.3
          })
        });

        const data = await res.json().catch(() => ({}));
        const reply = data?.reply || data?.choices?.[0]?.message?.content || "(no reply)";
        body.insertAdjacentHTML("beforeend", `<div class="copilot-msg"><b>Agent:</b> ${escapeHtml(reply)}</div>`);
        body.scrollTop = body.scrollHeight;
      } catch (err) {
        body.insertAdjacentHTML("beforeend", `<div class="copilot-msg"><b>Agent:</b> (network error)</div>`);
      }
    }

    send.addEventListener("click", () => ask(input.value));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(input.value); });

    return { panel, body, input, send };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));
  }

  async function init(opts = {}) {
    // Merge theme config (optional)
    const cfgFromFile = await readConfig(opts.configPath);
    const cfg = { ...cfgFromFile, ...opts };

    if (!cfg.proxyUrl) {
      console.error("[Copilot] Missing proxyUrl");
      return;
    }

    buildUI(cfg);
  }

  // Public API
  window.TonyChatWidget = { init };
  // Optional compatibility wrapper
  window.CopilotWidget = function (o) { this.o = o; this.init = () => init(this.o); };
})();
