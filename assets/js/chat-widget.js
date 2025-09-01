/* Chat widget script for Tony Abdelmalak's website.
   Deduplicates the chat DOM, uses local responses for demonstration, and renders replies.
*/
(function() {
  // Remove any duplicate widget instances
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

  // Local response generator
  function getLocalResponse(message) {
    const text = message.toLowerCase();
    if (text.includes('attrition')) {
      return 'Attrition refers to employees leaving the company. It is measured as the percentage of departing employees relative to the total workforce over a period.';
    }
    if (text.includes('ticket') && text.includes('sales')) {
      return 'Ticket sales represent revenue from ticket purchases; analyzing them helps forecast demand and guide marketing.';
    }
    if (text.includes('pivot')) {
      return 'A pivot is a significant change in business strategy to test a new approach.';
    }
    if (text.includes('forecast')) {
      return 'A forecast is an estimate of future outcomes based on historical data and assumptions.';
    }
    if (text.includes('tell me about yourself') || text.includes('who are you') || text.includes('what is your name')) {
      return "I am Tony's AI assistant, designed to answer your questions and provide insights.";
    }
    if (text.includes('where are you from') || text.includes('what is your origin')) {
      return 'As an AI, I don\'t have a physical location, but I\'m here to assist you online.';
    }
    if (text.includes('personal') || text.includes('are you real')) {
      return 'I am a software program created to provide information; I do not have personal experiences.';
    }
    return "I'm sorry, I do not have an answer to that question right now.";
  }

  const messages = [];

  async function sendMessage() {
    const input = document.getElementById('hf-input');
    const msg = input.value.trim();
    if (!msg) return;
    appendMessage('user', msg);
    messages.push({ role: 'user', content: msg });
    input.value = '';
    const reply = getLocalResponse(msg);
    appendMessage('ai', reply);
    messages.push({ role: 'assistant', content: reply });
  }

  document.addEventListener('DOMContentLoaded', () => {
    removeDuplicateChat();
    const toggle   = document.getElementById('hf-chat-toggle');
    const container = document.getElementById('hf-chat-container');
    const input    = document.getElementById('hf-input');
    const sendBtn  = document.getElementById('hf-send-btn');
       container.style.display = 'flex';
    if (!toggle || !container || !input || !sendBtn) {
      console.error('[chat] missing DOM elements');
      return;
    }
    toggle.addEventListener('click', () => {
      container.style.display = (container.style.display === 'none' || !container.style.display) ? 'flex' : 'none';
    });
    sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sendMessage();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });
  });
})();
