// agent-widget.js — single-file, idempotent loader (no external CSS/JSON)
(function () {
  const s = document.currentScript;
  if (!s) return;

  // Read attributes
  const cfg = {
    proxyUrl: s.getAttribute("data-proxy-url"),
    title: s.getAttribute("data-title") || "Ask Tony’s Copilot",
    greeting: s.getAttribute("data-greeting") || "How can I help?",
    accent: s.getAttribute("data-accent") || "#4f46e5",
    radius: s.getAttribute("data-radius") || "12px",
    rateLimit: Number(s.getAttribute("data-rate-limit") || 10),
    avatar: s.getAttribute("data-avatar") || "",
    system: (s.getAttribute("data-system") || "").trim(),
  };

  if (!cfg.proxyUrl) {
    console.error("[TonyWidget] Missing data-proxy-url");
    return;
  }

  // Prevent duplicate mount
  if (document.getElementById("tony-widget")) return;

  // Styles
  const style = document.createElement("style");
  style.textContent = `
  #tony-widget{position:fixed;bottom:20px;right:20px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,sans-serif;z-index:2147483647}
  #tw-btn{display:flex;align-items:center;gap:10px;background:${cfg.accent};color:#fff;border:none;border-radius:${cfg.radius};padding:12px 14px;box-shadow:0 6px 20px rgba(0,0,0,.15);cursor:pointer}
  #tw-btn img{width:24px;height:24px;border-radius:50%;object-fit:cover;display:${cfg.avatar?'block':'none'}}
  #tw-panel{position:fixed;bottom:90px;right:20px;width:360px;max-height:70vh;border-radius:${cfg.radius};box-shadow:0 12px 30px rgba(0,0,0,.25);overflow:hidden;background:#fff;display:none;flex-direction:column}
  #tw-header{background:${cfg.accent};color:#fff;padding:10px 12px;font-weight:600;display:flex;align-items:center;gap:8px}
  #tw-header img{width:20px;height:20px;border-radius:50%;object-fit:cover;display:${cfg.avatar?'block':'none'}}
  #tw-body{padding:10px;overflow:auto;max-height:55vh;border-top:1px solid #eee;border-bottom:1px solid #eee}
  #tw-input{display:flex;gap:8px;padding:10px}
  #tw-input input{flex:1;padding:10px;border:1px solid #ddd;border-radius:10px}
  #tw-input button{padding:10px 12px;border:1px solid ${cfg.accent};color:${cfg.accent};background:#fff;border-radius:10px;cursor:pointer}
  .tw-msg{margin:8px 0}
  .tw-me{font-weight:600}
  `;
  document.head.appendChild(style);

  // UI
  const root = document.createElement("div");
  root.id = "tony-widget";
  root.innerHTML = `
    <div id="tw-panel">
      <div id="tw-header">${cfg.avatar ? `<img src="${escapeAttr(cfg.avatar)}" alt=""/>` : ""}<span>${escapeHtml(cfg.title)}</span></div>
      <div id="tw-body"><div class="tw-msg">${escapeHtml(cfg.greeting)}</div></div>
      <div id="tw-input">
        <input id="tw-text" placeholder="Type your question..." />
        <button id="tw-send">Send</button>
      </div>
    </div>
    <button id="tw-btn">${cfg.avatar ? `<img src="${escapeAttr(cfg.avatar)}" alt=""/>` : ""}<span>Chat</span></button>
  `;
  document.body.appendChild(root);

  const panel = root.querySelector("#tw-panel");
  const btn = root.querySelector("#tw-btn");
  const body = root.querySelector("#tw-body");
  const input = root.querySelector("#tw-text");
  const send = root.querySelector("#tw-send");

  btn.addEventListener("click", () => {
    panel.style.display = panel.style.display === "flex" ? "none" : "flex";
  });

  // Simple client-side rate limit
  let sentInWindow = 0;
  setInterval(() => { sentInWindow = 0; }, 60_000);

  async function ask(q) {
    if (!q) return;
    if (sentInWindow >= cfg.rateLimit) {
      body.insertAdjacentHTML("beforeend", `<div class="tw-msg">Agent: (rate limit reached — try again in a minute)</div>`);
      body.scrollTop = body.scrollHeight;
      return;
    }
    sentInWindow++;

    body.insertAdjacentHTML("beforeend", `<div class="tw-msg tw-me">You: ${escapeHtml(q)}</div>`);
    input.value = "";
    try {
      const payload = {
        messages: [
          ...(cfg.system ? [{ role: "system", content: cfg.system }] : []),
          { role: "user", content: q }
        ]
      };
      const res = await fetch(cfg.proxyUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      const a = (data && data.reply) || (data?.choices?.[0]?.message?.content) || "…";
      body.insertAdjacentHTML("beforeend", `<div class="tw-msg">Agent: ${escapeHtml(String(a))}</div>`);
      body.scrollTop = body.scrollHeight;
    } catch (e) {
      body.insertAdjacentHTML("beforeend", `<div class="tw-msg">Agent: (network error)</div>`);
      body.scrollTop = body.scrollHeight;
      console.error("[TonyWidget] fetch error", e);
    }
  }
  send.addEventListener("click", () => ask(input.value.trim()));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(input.value.trim()); });

  function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]))}
  function escapeAttr(s){return String(s).replace(/"/g,"&quot;")}
})();
