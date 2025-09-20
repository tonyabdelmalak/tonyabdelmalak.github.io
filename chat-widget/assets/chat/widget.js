// chat-widget/assets/chat/widget.js
// Very simple floating chat button + panel

(async function () {
  const root = document.getElementById("chat-widget-root");
  if (!root) return;

  // Load config.json
  const configRes = await fetch("/chat-widget/assets/chat/config.json");
  const config = await configRes.json();

  // Create button
  const btn = document.createElement("button");
  btn.innerText = "💬 Chat";
  btn.id = "chat-toggle";
  btn.style.position = "fixed";
  btn.style.bottom = "20px";
  btn.style.right = "20px";
  btn.style.padding = "12px 16px";
  btn.style.borderRadius = config.radius || "12px";
  btn.style.background = config.accent || "#4f46e5";
  btn.style.color = "#fff";
  btn.style.border = "none";
  btn.style.cursor = "pointer";
  btn.style.zIndex = 9999;

  // Create panel
  const panel = document.createElement("div");
  panel.id = "chat-panel";
  panel.style.position = "fixed";
  panel.style.bottom = "70px";
  panel.style.right = "20px";
  panel.style.width = "320px";
  panel.style.height = "400px";
  panel.style.border = "1px solid #ccc";
  panel.style.borderRadius = config.radius || "12px";
  panel.style.background = "#fff";
  panel.style.display = "none";
  panel.style.flexDirection = "column";
  panel.style.zIndex = 9999;
  panel.style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)";

  // Chat log
  const log = document.createElement("div");
  log.id = "chat-log";
  log.style.flex = "1";
  log.style.overflowY = "auto";
  log.style.padding = "8px";
  log.innerHTML = `<p><strong>${config.title}</strong><br>${config.greeting}</p>`;

  // Input area
  const form = document.createElement("form");
  form.style.display = "flex";
  form.style.borderTop = "1px solid #ddd";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type a message...";
  input.style.flex = "1";
  input.style.border = "none";
  input.style.padding = "8px";

  const send = document.createElement("button");
  send.type = "submit";
  send.innerText = "Send";
  send.style.background = config.accent || "#4f46e5";
  send.style.color = "#fff";
  send.style.border = "none";
  send.style.padding = "0 12px";
  send.style.cursor = "pointer";

  form.appendChild(input);
  form.appendChild(send);

  panel.appendChild(log);
  panel.appendChild(form);

  // Toggle logic
  btn.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
  });

  // Form submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    log.innerHTML += `<p><strong>You:</strong> ${text}</p>`;
    input.value = "";

    const res = await fetch(config.workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();

    if (data?.ok && data.message) {
      log.innerHTML += `<p><strong>Agent:</strong> ${data.message}</p>`;
    } else {
      log.innerHTML += `<p><em>Error: ${data?.error || "failed"}</em></p>`;
    }

    log.scrollTop = log.scrollHeight;
  });

  // Inject into page
  root.appendChild(btn);
  root.appendChild(panel);
})();
