// Chat Widget — /chat-widget/assets/chat/widget.js
// Mounts onto <div id="chat-widget-root"></div> and talks to your Worker.

(async function boot() {
  const mount = ensureMount();
  const cfg = await loadConfig();
  applyTheme(cfg);

  // Preload system persona text (cached per page load)
  const system = await fetchSystem(cfg.systemUrl);

  // Build UI
  const { launcher, panel, closeBtn, scroll, note, form, input, send } = buildShell(cfg, mount);
  if (cfg.greeting) addBot(scroll, cfg.greeting);

  // Open/close
  launcher.addEventListener('click', () => {
    panel.style.display = 'block';
    launcher.classList.add('cw-hidden');
    input.focus();
  });
  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
    launcher.classList.remove('cw-hidden');
  });

  // Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    addUser(scroll, text);
    input.value = '';
    input.focus();

    const stopTyping = showTyping(scroll);

    try {
      send.disabled = true;

      const res = await fetch(cfg.workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          system,                      // <— persona injected here
          model: cfg.model,
          temperature: cfg.temperature
          // history: []                // optionally include your own message history array
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.text || data.reply || data.message)) {
        addBot(scroll, data.text || data.reply || data.message);
      } else {
        const detail =
          data?.detail?.error?.message ||
          data?.detail?.error?.code ||
          data?.error ||
          'failed';
        addError(note, `Error: ${detail}`);
      }
    } catch (err) {
      addError(note, `Network error: ${String(err)}`);
    } finally {
      stopTyping();
      send.disabled = false;
      scrollToEnd(scroll);
    }
  });

  // Enter to send, Shift+Enter for newline
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });
})();

// ---------------- helpers ----------------

async function loadConfig() {
  try {
    const res = await fetch('/chat-widget/assets/chat/config.json', { cache: 'no-store' });
    return await res.json();
  } catch {
    return {
      workerUrl: '/chat',
      title: 'Chat',
      greeting: 'Hi! Ask me anything.',
      accent: '#4f46e5',
      radius: '14px',
      model: 'llama-3.1-8b-instant',
      temperature: 0.2,
      systemUrl: ''
    };
  }
}

function applyTheme(cfg = {}) {
  const root = document.documentElement;
  root.style.setProperty('--chat-accent', cfg.accent || '#4f46e5');
  root.style.setProperty('--chat-radius', cfg.radius || '14px');
}

function ensureMount() {
  let root = document.querySelector('#chat-widget-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'chat-widget-root';
    document.body.appendChild(root);
  }
  return root;
}

function buildShell(cfg, mount) {
  mount.innerHTML = `
    <button class="cw-launcher" id="cw-launch" aria-label="Open chat">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3C7.03 3 3 6.58 3 11a7.6 7.6 0 0 0 2.1 5.1l-.7 3.2c-.1.5.36.95.85.83l3.7-.93A10.8 10.8 0 0 0 12 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" fill="currentColor"/></svg>
    </button>

    <div class="cw-wrap" id="cw-panel" role="dialog" aria-label="Chat">
      <div class="cw-head">
        <button class="cw-close" id="cw-close" aria-label="Close">✕</button>
        <h3 class="cw-title" id="cw-title">${escapeHtml(cfg.title || "What's on your mind?")}</h3>
        <p class="cw-sub" id="cw-sub">We’re online</p>
      </div>
      <div class="cw-body">
        <div class="cw-scroll" id="cw-scroll"></div>
        <div class="cw-note" id="cw-note"></div>
        <form class="cw-input" id="cw-form">
          <input id="cw-text" type="text" autocomplete="off" placeholder="Type a message…" />
          <button class="cw-send" id="cw-send" type="submit">Send</button>
        </form>
      </div>
    </div>
  `;

  return {
    launcher: mount.querySelector('#cw-launch'),
    panel: mount.querySelector('#cw-panel'),
    closeBtn: mount.querySelector('#cw-close'),
    scroll: mount.querySelector('#cw-scroll'),
    note: mount.querySelector('#cw-note'),
    form: mount.querySelector('#cw-form'),
    input: mount.querySelector('#cw-text'),
    send: mount.querySelector('#cw-send')
  };
}

function addBot(mount, text) {
  const row = document.createElement('div');
  row.className = 'cw-row bot';
  row.innerHTML = `<div class="cw-bubble">${escapeHtml(text)}</div>`;
  mount.appendChild(row);
  scrollToEnd(mount);
}

function addUser(mount, text) {
  const row = document.createElement('div');
  row.className = 'cw-row user';
  row.innerHTML = `<div class="cw-bubble">${escapeHtml(text)}</div>`;
  mount.appendChild(row);
  scrollToEnd(mount);
}

function addError(noteEl, msg) {
  noteEl.textContent = msg;
  setTimeout(() => (noteEl.textContent = ''), 6000);
}

function showTyping(mount) {
  const row = document.createElement('div');
  row.className = 'cw-row bot';
  row.innerHTML = `
    <div class="cw-bubble">
      <span class="cw-typing">
        <span class="cw-dot"></span><span class="cw-dot"></span><span class="cw-dot"></span>
      </span>
    </div>`;
  mount.appendChild(row);
  scrollToEnd(mount);
  return () => row.remove();
}

function scrollToEnd(el) {
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s='') {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function fetchSystem(url) {
  if (!url) return '';
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return '';
    const text = await r.text();
    return (text || '').toString().slice(0, 12000); // trim for safety
  } catch {
    return '';
  }
}
