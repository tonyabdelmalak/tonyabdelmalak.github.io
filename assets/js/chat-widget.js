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

  // Simple helper to get elements by id
  function $(id) {
    return document.getElementById(id);
  }

  // Append a message to the conversation log
  function appendMessage(sender, text) {
    const log = $('hf-conversation');
    const div = document.createElement('div');
    div.style.margin = '6px 0';
    div.textContent = sender + ': ' + text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  // Conversation state
  const MODEL = 'gpt-3.5-turbo';
  const messages = [];

  document.addEventListener('DOMContentLoaded', function() {
    removeDuplicateChat();
    const toggle = $('hf-chat-toggle');
    const container = $('hf-chat-container');
    const form = $('hf-chat-form');
    const input = $('hf-input');
    const sendBtn = $('hf-send-btn');
    const log = $('hf-conversation');

    if (!toggle || !container || !form || !input || !sendBtn || !log) {
      console.error('[chat] missing elements');
      return;
    }

    // open/close chat
    toggle.addEventListener('click', function() {
      const isOpen = container.style.display === 'flex' || container.style.display === 'block';
      container.style.display = isOpen ? 'none' : 'block';
    });

    async function sendMessage() {
      const msg = input.value.trim();
      if (!msg) return;
      appendMessage('You', msg);
      input.value = '';
      messages.push({ role: 'user', content: msg });
      try {
        const response = await fetch('https://tonyabdelmalak-github-io.vercel.app/api/chat-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages,
            model: MODEL,
            max_tokens: 300,
            temperature: 0.7
          })
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content?.trim() || data.reply || '[no reply]';
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
    sendBtn.addEventListener('click', function(e) {
      e.preventDefault();
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
