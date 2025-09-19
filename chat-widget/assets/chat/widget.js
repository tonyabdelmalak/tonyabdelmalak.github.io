(() => {
  // Prevent double init
  if (window.__TONY_CHAT_INIT__) return; window.__TONY_CHAT_INIT__ = true;

  // === CONFIG ===
  // After you publish your Cloudflare Worker, replace this with its HTTPS URL + /chat
  const WORKER_URL = ""; // e.g., "https://tony-chat.your-subdomain.workers.dev/chat"
  const AVATAR_SRC = "/assets/chat/avatar-tony.jpg"; // ensure this image exists
  // ==============

  // Build launcher
  const launcher = document.createElement("button");
  launcher.className = "chat-launcher";
  launcher.id = "chat-launcher";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.innerHTML = `<img src="${AVATAR_SRC}" alt="Tony">`;

  // Build chat box
  const box = document.createElement("section");
  box.className = "chat-container chat-hidden";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.innerHTML = `
    <header class="chat-header">
      <div class="title">
        <img src="${AVATAR_SRC}" alt="Tony">
        <div>
          <div>Chat with Tony</div>
          <div class="sub">We are online!</div>
        </div>
      </div>
      <button class="close" title="Close" type="button">✕</button>
    </header>
    <div class="chat-messages" id="chat-messages"></div>
    <form class="chat-input" id="chat-form">
      <textarea id="chat-text" placeholder="Enter your message..." rows="1"></textarea>
      <button type="submit" title="Send">➤</button>
    </form>
  `;

  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(launcher);
    document.body.appendChild(box);
    addMsg("Hi! Ask me anything — I’ll reply here.", "ai");
  });

  // State
  const msgs = [];
  const $msgs = () => document.getElementById("chat-messages");
  const $form = () => document.getElementById("chat-form");
  const $text = () => document.getElementById("chat-text");

  function openChat(){ box.classList.remove("chat-hidden"); box.classList.add("open"); setTimeout(() => $text().focus(), 0); }
  function closeChat(){ box.classList.add("chat-hidden"); box.classList.remove("open"); }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#chat-launcher")) openChat();
    if (e.target.closest(".chat-header .close")) closeChat();
  });

  function addMsg(content, role){
    msgs.push({ role, content });
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    div.textContent = content;
    $msgs().appendChild(div);
    $msgs().scrollTop = $msgs().scrollHeight;
  }

  // Autosize textarea + Enter to send
  document.addEventListener("input", (e) => {
    if (e.target === $text()) {
      e.target.style.height = "0px";
      e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target === $text() && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $form().dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

  document.addEventListener("submit", async (e) => {
    if (e.target !== $form()) return;
    e.preventDefault();
    const v = $text().value.trim();
    if (!v) return;
    addMsg(v, "user");
    $text().value = "";
    $text().style.height = "44px";

    // If no backend yet, keep the UI friendly (no scary error)
    if (!WORKER_URL) {
      addMsg("Thanks! My backend isn’t connected yet — paste your Worker URL in widget.js when ready.", "ai");
      return;
    }

    try{
      const history = msgs.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: v, history })
      });
      const data = await res.json();
      addMsg(data.reply || "I don’t have that info yet, but I can link you to Tony’s portfolio.", "ai");
    }catch(err){
      console.error("[chat-widget] backend error", err);
      addMsg("Sorry — I’m having trouble reaching my brain.", "ai");
    }
  });
})();
