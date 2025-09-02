/**
 * Chat widget script that calls the backend API on Vercel.
 * Maintains conversation context and handles fallback errors.
 */

function appendMessage(sender, message) {
  const conversation = document.getElementById('hf-conversation');
  const bubble = document.createElement('div');
  // assign classes based on sender
  bubble.className = sender === 'user' ? 'hf-user-message' : 'hf-ai-message';
  bubble.textContent = message;
  conversation.appendChild(bubble);
  conversation.scrollTop = conversation.scrollHeight;
}

// Maintain conversation history
const messages = [];

// Sends user message and retrieves assistant response from API
async function sendMessage() {
  const input = document.getElementById('hf-input');
  const msg = input.value.trim();
  if (!msg) return;
  // append user message
  appendMessage('user', msg);
  messages.push({ role: 'user', content: msg });
  input.value = '';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    const reply = data.reply || (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const replyText = reply.trim();
    appendMessage('ai', replyText);
    messages.push({ role: 'assistant', content: replyText });
  } catch (err) {
    appendMessage('ai', 'Sorry, I encountered an error processing your request.');
  }
}

// Initialize chat widget
function initChat() {
  const container = document.getElementById('hf-chat-container');
  const toggle = document.getElementById('hf-chat-toggle');
  const sendBtn = document.getElementById('hf-send-btn');
  const input = document.getElementById('hf-input');
  // Show chat container by default
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
