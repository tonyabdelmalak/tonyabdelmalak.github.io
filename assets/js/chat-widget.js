/*
 Chat widget script for Tony Abdelmalak's website.
 Rewritten to use a proxy base URL from a JSON config (#hf-chat-config).
 It attaches listeners after DOM load, opens/closes the chat panel,
 sends messages to the proxy, and renders replies.
*/

(function () {
  function $id(id) { return document.getElementById(id); }

  function readConfig() {
    try {
      const raw = document.getElementById('hf-chat-config')?.textContent || '{}';
      return JSON.parse(raw);
    } catch (e) {
      console.error('[chat] bad config JSON', e);
      return {};
    }
  }

  function init() {
    const wrapper = $id('hf-chat-wrapper');
    const toggle  = $id('hf-chat-toggle');
    const panel   = $id('hf-chat-container');
    const form    = $id('hf-chat-form');
    const input   = $id('hf-input');
    const log     = $id('hf-conversation');
    if (!wrapper || !toggle || !panel || !form || !input || !log) {
      console.error('[chat] missing one or more widget elements');
      return;
    }

    // Open/close panel on toggle click
    toggle.addEventListener('click', function () {
      const open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
    });

    const cfg  = readConfig();
    const BASE = (cfg.proxyBaseUrl || 'https://reflectiv-agent.onrender.com').replace(/\/+$/, '');

    function say(role, text) {
      const div = document.createElement('div');
      div.style.margin = '6px 0';
      div.textContent = role === 'user' ? `You: ${text}` : text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    async function sendToProxy(message) {
      const res = await fetch(`${BASE}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (!res.ok) throw new Error(`Proxy ${res.status}`);
      return res.json();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      say('user', text);
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        const data = await sendToProxy(text);
        const reply = data?.reply || data?.choices?.[0]?.message?.content || '[no reply]';
        say('ai', reply);
      } catch (err) {
        console.error(err);
        say('ai', 'Sorry—cannot reach the server.');
      } finally {
        if (btn) btn.disabled = false;
        input.focus();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
