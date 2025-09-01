/* Chat widget script for Tony Abdelmalak's website.
   Deduplicates the chat DOM, sends messages to the Vercel proxy, and renders replies.
*/
(function() {
  // Remove duplicate widget instances
  function removeDuplicateChat() {
    const kill = (sel) => {
      const nodes = document.querySelectorAll(sel);
      nodes.forEach((n, i) => {
        if (i > 0) n.remove();
      });
    };
    kill('#hf-chat-wrapper');
    kill('#hf-chat-toggle');
    kill('#hf-chat-container');
  }

  // Append a message to the conversation log
  function appendMessage(role, text) {
    const log = document.getElementById('hf-conversation');
    if (!log) return;
    const div = document.createElement('div');
    div.className = `msg-${role}`;
    div.innerHTML = `<strong>${role === 'user' ? 'You' : 'AI'}:</strong> ${text}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  const MODEL = 'gpt-3.5-turbo';
  const messages = [];
  const proxyUr'https://tonyabdelmalak-github-io.vercel.app/api/chat-proxy';

  async function sendMessage() {
    const input = document.getElementById('hf-input');
    const msg = input.value.trim();
    if (!msg) return;
    appendMessage('user', msg);
    messages.push({ role: 'user', content: msg });
    input.value = '';
    try {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model: MODEL, max_tokens: 300, temperature: 0.7 }),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content?.trim() || '';
      appendMessage('ai', reply);
      messages.push({ role: 'assistant', content: reply });
    } catch (err) {
      appendMessage('ai', 'Error: ' + err.message);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    removeDuplicateChat();
    const toggle = document.getElementById('hf-chat-toggle');
    const container = document.getElementById('hf-chat-container');
    const form = document.getElementById('hf-chat-form');
    const input = document.getElementById('hf-input');
    const sendBtn = document.getElementById('hf-send-btn');
    if (!toggle || !container || !form || !input || !sendBtn) {
      console.error('[chat] missing DOM elements');
      return;
    }
    toggle.addEventListener('click', () => {
      if (container.style.display === 'none' || !container.style.display) {
        container.style.display = 'flex';
      } else {
        container.style.display = 'none';
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });
    sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sendMessage();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  });
})();
