(function() {
  const style = document.createElement('style');
  style.textContent = `
#openai-chat-toggle {
  position: fixed; bottom: 20px; right: 20px; z-index: 99999;
  background: #007bff; color: #fff; padding: 10px 15px;
  border-radius: 50%; cursor: pointer; font-weight: bold;
  font-size: 16px; border: none;
}
#openai-chat-container {
  position: fixed; bottom: 80px; right: 20px; width: 350px; height: 400px;
  background: #fff; border: 1px solid #ccc; border-radius: 5px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2); z-index: 99999;
  display: none; flex-direction: column;
}
#openai-chat-header {
  background: #007bff; color: #fff; padding: 8px; font-weight: bold;
  border-bottom: 1px solid #ccc;
}
#openai-chat-messages {
  flex: 1; padding: 8px; overflow-y: auto; font-size: 14px;
}
#openai-chat-input {
  padding: 8px; border-top: 1px solid #ccc; display: flex;
}
#openai-chat-input input {
  flex: 1; padding: 4px;
}
#openai-chat-input button {
  padding: 4px 8px; margin-left: 4px;
}
.openai-chat-message {
  margin-bottom: 6px;
}
.openai-chat-message.user {
  text-align: right;
}
`;
  document.head.appendChild(style);

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'openai-chat-toggle';
  toggleBtn.textContent = 'Chat';
  document.body.appendChild(toggleBtn);

  const container = document.createElement('div');
  container.id = 'openai-chat-container';
  container.innerHTML = `
    <div id="openai-chat-header">AI Chat</div>
    <div id="openai-chat-messages"></div>
    <div id="openai-chat-input">
      <input type="text" placeholder="Type a message..." />
      <button>Send</button>
    </div>
  `;
  document.body.appendChild(container);

  const messagesDiv = container.querySelector('#openai-chat-messages');
  const inputEl = container.querySelector('#openai-chat-input input');
  const sendBtn = container.querySelector('#openai-chat-input button');

  let messages = [];

  function appendMessage(text, isUser) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'openai-chat-message' + (isUser ? ' user' : '');
    msgDiv.textContent = text;
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;
    appendMessage(text, true);
    messages.push({ role: 'user', content: text });
    inputEl.value = '';
    try {
      const res = await fetch('/api/openai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });
      const data = await res.json();
      const reply = data.message || '';
      appendMessage(reply, false);
      messages.push({ role: 'assistant', content: reply });
    } catch (e) {
      appendMessage('Error: ' + e.message, false);
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  toggleBtn.addEventListener('click', () => {
    if (container.style.display === 'none' || container.style.display === '') {
      container.style.display = 'flex';
    } else {
      container.style.display = 'none';
    }
  });
})();
