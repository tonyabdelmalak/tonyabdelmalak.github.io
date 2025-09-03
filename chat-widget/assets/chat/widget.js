/* chat widget loader + UI
   - Respects <script data-chat="enabled|disabled"> on this script tag
   - Loads runtime config from /assets/chat/config.json
   - Loads system persona text from /assets/chat/system.md
   - Renders a FAB with /assets/img/profile-img.jpg
   - Toggles a chat panel in the bottom-right corner
   - Calls a proxy endpoint defined at config.proxyUrl
*/
(() => {
  'use strict';

  // Only initialize once
  if (window.__CHAT_WIDGET_ACTIVE__) return;
  window.__CHAT_WIDGET_ACTIVE__ = true;

  const thisScript = document.currentScript || (function(){
    const els = document.querySelectorAll('script[src$="assets/chat/widget.js"]');
    return els[els.length - 1] || null;
  })();

  const mode = (thisScript && (thisScript.dataset.chat || 'enabled')) || 'enabled';
  if (mode !== 'enabled') return;

  const defaults = {
    proxyUrl: '',
    title: "Ask Tony’s Copilot",
    greeting: "How can I help you explore Tony’s journey, dashboards, or career?",
    brand: { accent: 'AUTO', radius: '12px' },
    rateLimit: 10
  };

  const cfgUrl = "/assets/chat/config.json";
  const personaUrl = "/assets/chat/system.md";
  let CFG = { ...defaults };
  let SYSTEM_PROMPT = "";

  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const el = (tag, attrs={}, children=[]) => {
    const node = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const child of [].concat(children)) {
      if (child == null) continue;
      if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  };

  function setCSSVars() {
    const root = document.documentElement;
    if (CFG.brand && CFG.brand.radius) {
      root.style.setProperty('--chat-radius', CFG.brand.radius);
    }
    if (CFG.brand && CFG.brand.accent && CFG.brand.accent !== 'AUTO') {
      root.style.setProperty('--chat-accent', CFG.brand.accent);
    }
  }

  async function loadConfig() {
    try {
      const res = await fetch(cfgUrl, { cache: 'no-store' });
      if (res.ok) {
        const obj = await res.json();
        CFG = { ...CFG, ...obj };
      }
    } catch (e) {
      console.warn("[chat-widget] Failed to load config.json; using defaults", e);
    }
    setCSSVars();
  }

  async function loadPersona() {
    try {
      const res = await fetch(personaUrl, { cache: 'no-store' });
      if (res.ok) {
        SYSTEM_PROMPT = await res.text();
      }
    } catch (e) {
      console.warn("[chat-widget] Failed to load system.md", e);
    }
  }

  // Rate limit: max N sends per rolling minute
  const sendTimestamps = [];
  const windowMs = 60_000;
  function canSend() {
    const now = Date.now();
    while (sendTimestamps.length && sendTimestamps[0] <= now - windowMs) sendTimestamps.shift();
    return sendTimestamps.length < Number(CFG.rateLimit || 10);
  }
  function recordSend() { sendTimestamps.push(Date.now()); }

  // Build UI
  function buildUI() {
    if ($('#chat-fab') || $('#chat-panel')) return; // already present

    const fab = el('button', { id: 'chat-fab', class: 'chat-fab', 'aria-label': 'Open chat' }, [
      el('img', { src: '/assets/img/profile-img.jpg', alt: "Tony's avatar", class: 'chat-fab-avatar' })
    ]);

    const panel = el('div', { id: 'chat-panel', class: 'chat-panel', 'aria-hidden': 'true' }, [
      el('div', { class: 'chat-header' }, [
        el('div', { class: 'chat-title' }, [CFG.title || 'Chat']),
        el('button', { class: 'chat-close', 'aria-label': 'Close chat', onclick: () => togglePanel(false) }, ['×'])
      ]),
      el('div', { id: 'chat-messages', class: 'chat-messages', role: 'log', 'aria-live': 'polite' }),
      el('div', { class: 'chat-input' }, [
        el('textarea', { id: 'chat-input-text', class: 'chat-textarea', rows: '1', placeholder: 'Type your message… (Shift+Enter for newline)' }),
        el('button', { id: 'chat-send', class: 'chat-send', 'aria-label': 'Send' }, ['Send'])
      ])
    ]);

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener('click', () => togglePanel());
    $('#chat-send').addEventListener('click', () => submitFromInput());
    $('#chat-input-text').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitFromInput(); }
    });

    // Greeting message
    if (CFG.greeting) addMessage('assistant', CFG.greeting);
  }

  function togglePanel(force) {
    const panel = $('#chat-panel');
    const fab = $('#chat-fab');
    if (!panel) return;
    const open = force != null ? force : panel.classList.contains('open') === false;
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) $('#chat-input-text')?.focus();
  }

  function addMessage(role, text) {
    const wrap = $('#chat-messages');
    if (!wrap) return;
    const bubble = el('div', { class: `chat-bubble ${role}` }, [
      el('div', { class: 'chat-bubble-inner' }, [text])
    ]);
    wrap.appendChild(bubble);
    wrap.scrollTop = wrap.scrollHeight;
  }

  function setBusy(busy) {
    const sendBtn = $('#chat-send');
    const input = $('#chat-input-text');
    sendBtn.disabled = !!busy;
    input.disabled = !!busy;
    if (busy) sendBtn.setAttribute('data-state', 'loading');
    else sendBtn.removeAttribute('data-state');
  }

  const HISTORY = []; // {role, content}

  async function submitFromInput() {
    const input = $('#chat-input-text');
    const txt = (input.value || '').trim();
    if (!txt) return;
    if (!CFG.proxyUrl) {
      addMessage('assistant', 'Proxy URL is not configured. Please update /assets/chat/config.json.');
      return;
    }
    if (!canSend()) {
      addMessage('assistant', 'Rate limit reached. Please wait a moment and try again.');
      return;
    }

    // Show user message
    addMessage('user', txt);
    HISTORY.push({ role: 'user', content: txt });
    input.value = '';
    setBusy(true);
    recordSend();

    try {
      const payload = {
        model: CFG.model || 'llama-3.1-8b-instant',
        messages: [
          ...(SYSTEM_PROMPT ? [{ role: 'system', content: SYSTEM_PROMPT }] : []),
          ...HISTORY.slice(-10) // last exchanges to keep context small
        ],
        temperature: 0.3,
        stream: false
      };

      const res = await fetch(CFG.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Proxy error ${res.status}: ${txt}`);
      }

      const data = await res.json();
      const answer = (data && data.content) ? data.content : 'No response content.';
      HISTORY.push({ role: 'assistant', content: answer });
      addMessage('assistant', answer);
    } catch (err) {
      console.error('[chat-widget] send failed', err);
      addMessage('assistant', 'Sorry—there was a problem reaching the proxy. Check your CSP and proxy URL, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    await Promise.all([loadConfig(), loadPersona()]);
    buildUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();