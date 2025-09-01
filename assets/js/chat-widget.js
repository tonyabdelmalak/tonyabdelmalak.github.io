/*
 Chat widget script for Tony Abdelmalak's website.
 Restores functionality and uses Vercel proxy.
*/

(function() {
  // Remove duplicate instances of the widget to avoid conflicting handlers
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
  function appendMessage(sender, text) {
    const log = document.getElementById('hf-conversation');
    if (!log) return;
    const div = document.createElement('div');
    div.innerHTML = `<strong>${sender}:</strong> ${text}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  const MODEL = 'gpt-3.5-turbo';
  const messages = [];

  document.addEventListener('DOMContentLoaded', function() {
    removeDuplicateChat();
    const toggle = document.getElementById('hf-chat-toggle');
    const container = document.getElementById('hf-chat-container');
    const conversation = document.getElementById('hf-conversation');
    const form = document.getElementById('hf-chat-form');
    const input = document.getElementById('hf-input');
    const sendBtn = document.getElementById('hf-send-btn');
    if (!toggle || !container || !conversation || !form || !input || !sendBtn) return;

    // Toggle chat open/close
    toggle.addEventListener('click', () => {
      const isOpen = container.style.display !== 'none' && container.style.display !== '';
      container.style.display = isOpen ? 'none' : 'block';
    });

    async function sendMessage() {
      const msg = input.value.trim();
      if (!msg) return;
      appendMessage('You', msg);
      messages.push({ role: 'user', content: msg });
      input.value = '';
      try {
        // Concatenate string to avoid automatic line breaks in minification
        const proxyUrl = 'https://tonyabdelmalak-github-' + 'io.vercel.app/api/chat-proxy';
        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ messages, model: MODEL, max_tokens: 300, temperature: 0.7 })
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content?.trim() || '';
        appendMessage('Agent', reply);
        messages.push({ role: 'assistant', content: reply });
      } catch (err) {
        appendMessage('Agent', 'Error: ' + err.message);
      }
    }

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      sendMessage();
    });

    sendBtn.addEventListener('click', function() {
      sendMessage();
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  });
})();
