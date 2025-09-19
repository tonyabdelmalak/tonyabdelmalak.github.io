(function() {
  const AVATAR_SRC = "/assets/chat/avatar-tony.jpg"; // update if needed

  function el(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function createLauncher() {
    const btn = el('button', 'chat-launcher');
    btn.id = 'chat-launcher';
    btn.setAttribute('aria-label', 'Open chat');
    btn.innerHTML = `<img src="${AVATAR_SRC}" alt="Tony">`;
    document.body.appendChild(btn);
    return btn;
  }

  function createContainer() {
    const box = el('section', 'chat-container');
    box.innerHTML = `
      <header class="chat-header">
        <div class="title">
          <img src="${AVATAR_SRC}" alt="Tony">
          <div>
            <div>Chat with Tony</div>
            <div class="sub">We are online!</div>
          </div>
        </div>
        <button class="close" aria-label="Close">✕</button>
      </header>
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-input">
        <input id="chat-input" placeholder="Enter your message..." autocomplete="off">
        <button id="chat-send" aria-label="Send">➤</button>
      </div>
    `;
    document.body.appendChild(box);
    return box;
  }

  function scrollToEnd() {
    const m = document.getElementById('chat-messages');
    if (m) m.scrollTop = m.scrollHeight;
  }

  function addMsg(text, who = 'user') {
    const m = document.getElementById('chat-messages');
    if (!m) return;
    const d = el('div', 'msg ' + (who === 'user' ? 'user' : 'ai'));
    d.textContent = text;
    m.appendChild(d);
    scrollToEnd();
  }

  async function realReply(userText) {
    try {
      const res = await fetch("https://tony-chat.workers.dev/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText })
      });
      const data = await res.json();
      addMsg(data.reply || "I don’t have that info yet.", "ai");
    } catch (e) {
      console.error("[chat-widget] backend error", e);
      addMsg("Sorry — I’m having trouble reaching my brain.", "ai");
    }
  }

  function wireUp(box, launcher) {
    const close = box.querySelector('.close');
    const input = box.querySelector('#chat-input');
    const send = box.querySelector('#chat-send');

    const openBox = () => {
      box.classList.add('open');
      launcher.style.display = 'none';
      input?.focus();
    };
    const closeBox = () => {
      box.classList.remove('open');
      launcher.style.display = 'block';
    };

    launcher.addEventListener('click', openBox);
    close.addEventListener('click', closeBox);

    function doSend() {
      const v = input?.value.trim();
      if (!v) return;
      addMsg(v, 'user');
      input.value = '';
      realReply(v);
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });
    send.addEventListener('click', doSend);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const launcher = createLauncher();
    const box = createContainer();
    wireUp(box, launcher);
  });
})();
