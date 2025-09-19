// chat-widget/assets/chat/widget.js
// Path-proof loader + minimal chat post. Works on GitHub Pages or custom domain.

(function () {
  // --- Resolve base path from this script's src, fallback to known folder ---
  function getBasePath() {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].getAttribute('src') || '';
      if (src.endsWith('chat-widget/assets/chat/widget.js')) {
        const u = new URL(src, window.location.href);
        return u.href.replace(/widget\.js$/, '');
      }
      // handles relative includes like ./chat-widget/assets/chat/widget.js
      if (src.includes('chat-widget/assets/chat/widget.js')) {
        const u = new URL(src, window.location.href);
        return u.href.replace(/widget\.js$/, '');
      }
    }
    // Fallback: trailing slash required
    return new URL('./chat-widget/assets/chat/', window.location.href).href;
  }

  const BASE = getBasePath();
  const CONFIG_URL = new URL('config.json', BASE).href;
  const SYSTEM_URL = new URL('system.md', BASE).href;

  // --- Helpers ---
  async function safeFetchText(url, label) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) {
      throw new Error(`${label} fetch failed (${res.status}) at ${url}`);
    }
    return res.text();
  }

  async function safeFetchJson(url, label) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) {
      throw new Error(`${label} fetch failed (${res.status}) at ${url}`);
    }
    return res.json();
  }

  // --- State (filled at init) ---
  let CONFIG = null;
  let SYSTEM_MD = '';

  // --- Chat call to Worker ---
  async function sendToProxy(message, history = []) {
    if (!CONFIG || !CONFIG.proxyUrl) {
      throw new Error('proxyUrl missing in config.json');
    }
    const payload = {
      message,
      history,
      system: SYSTEM_MD,           // send system.md from repo
      model: CONFIG.model || 'llama3',
      temperature: 0.3,
      max_tokens: 160
    };

    const res = await fetch(CONFIG.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Proxy error ${res.status}: ${text}`);
    }

    const data = await res.json().catch(() => ({}));
    if (!data || typeof data.reply !== 'string') {
      throw new Error('Proxy returned no reply');
    }
    return data.reply;
  }

  // --- Minimal wiring to your existing UI (adjust selectors if different) ---
  function bindUI() {
    const input = document.querySelector('#chat-input, .chat-input, textarea[name="chat"]') || null;
    const sendBtn = document.querySelector('#chat-send, .chat-send, button[data-role="chat-send"]') || null;
    const out = document.querySelector('#chat-output, .chat-output, .messages') || null;

    if (!input || !sendBtn || !out) {
      console.warn('widget.js: Could not find expected chat elements. Ensure you have:');
      console.warn(' - input:  #chat-input  or  .chat-input  or  textarea[name="chat"]');
      console.warn(' - button: #chat-send   or  .chat-send   or  button[data-role="chat-send"]');
      console.warn(' - output: #chat-output or  .chat-output or  .messages');
      return;
    }

    let history = [];

    async function handleSend() {
      const msg = (input.value || '').trim();
      if (!msg) return;
      append(out, 'You', msg);
      input.value = '';
      try {
        const reply = await sendToProxy(msg, history);
        append(out, 'Agent', reply);
        history.push({ role: 'user', content: msg }, { role: 'assistant', content: reply });
        if (history.length > 24) history = history.slice(-24);
      } catch (err) {
        console.error(err);
        append(out, 'Agent', 'Sorry—having trouble reaching my brain right now. Try again in a moment.');
      }
    }

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  function append(container, who, text) {
    const row = document.createElement('div');
    row.className = `msg msg--${who.toLowerCase()}`;
    row.innerHTML = `<strong>${who}:</strong> ${escapeHtml(text)}`;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Init ---
  (async function init() {
    try {
      // Load config + system using the resolved base path
      CONFIG = await safeFetchJson(CONFIG_URL, 'config.json');
      SYSTEM_MD = await safeFetchText(SYSTEM_URL, 'system.md');

      // Optional greeting log
      console.info('[widget] Loaded config from', CONFIG_URL);
      console.info('[widget] Loaded system.md from', SYSTEM_URL);
      console.info('[widget] Using proxy:', CONFIG.proxyUrl);

      bindUI();
    } catch (err) {
      console.error('Widget init failed:', err);
      // Helpful hints
      console.error('Check these:');
      console.error('1) File paths exist exactly: chat-widget/assets/chat/{config.json, system.md, widget.js, widget.css}');
      console.error('2) config.json has a valid "proxyUrl" (your Cloudflare Worker /chat).');
      console.error('3) Worker ALLOWED_ORIGINS includes this site\'s origin.');
    }
  })();
})();
