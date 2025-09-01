/* Chat widget for Tony Abdelmalak's site
   Always visible, handles local responses.
*/
(function() {
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

  // Simple local responses
  function getLocalResponse(msg) {
    const text = msg.toLowerCase();
    if (text.includes('attrition')) {
      return 'Attrition refers to employees leaving the company. It is measured as the percentage of departing employees relative to the total workforce over a period.';
    }
    if (text.includes('ticket') && text.includes('sales')) {
      return 'Ticket sales represent revenue from ticket sales; analyzing them helps forecast demand and guide marketing.';
    }
    if (text.includes('pivot')) {
      return 'A pivot is a significant change in business strategy that can lead to improved outcomes by changing direction or focus.';
    }
    if (text.includes('forecast')) {
      return 'A forecast is an estimate of future outcomes based on historical data and assumptions.';
    }
    if (text.includes('tell me about yourself') || text.includes('who are you') || text.includes('what is your name')) {
      return "I am Tony's AI assistant, designed to answer your questions and provide insights.";
    }
    if (text.includes('where are you from') || text.includes('what is your origin')) {
      return "As an AI, I don't have a physical location; I'm here to assist you online.";
    }
    if (text.includes('personal') || text.includes('are you real')) {
      return 'I am a software program created to provide information; I do not have personal experiences.';
    }
    return "I'm sorry, I do not have an answer to that question right now.";
  }

  function sendMessage() {
    const input = document.getElementById('hf-input');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;
    appendMessage('user', msg);
    input.value = '';
    const reply = getLocalResponse(msg);
    appendMessage('ai', reply);
  }

  function initChat() {
    const container = document.getElementById('hf-chat-container');
    const toggle = document.getElementById('hf-chat-toggle');
    const input = document.getElementById('hf-input');
    const sendBtn = document.getElementById('hf-send-btn');
    // Always show the chat container
    if (container) {
      container.style.display = 'flex';
    }
    // Toggle button toggles chat visibility
    if (toggle && container) {
      toggle.addEventListener('click', () => {
        container.style.display = container.style.display === 'none' ? 'flex' : 'none';
      });
    }
    // Send button click
    if (sendBtn) {
      sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        sendMessage();
      });
    }
    // Enter key triggers send
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendMessage();
        }
      });
    }
  }

  // Initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChat);
  } else {
    initChat();
  }
})();
