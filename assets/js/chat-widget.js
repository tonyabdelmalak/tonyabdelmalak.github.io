/*
 Chat widget script for Tony Abdelmalak's website.
 Injects the chat UI and sends messages through a proxy while maintaining persona context.
*/
(function() {
  const PERSONA = `You are: a friendly, concise website concierge and code assistant for tonyabdelmalak.github.io.

Primary goals (in order):
- Hold short, natural conversations that highlight Tony’s background, career pivot, and goals.
- Share insights about projects and skills in a way that feels like a real chat.
- Ask at most one smart follow‑up question.
- When asked for technical help, output code snippets (HTML/CSS/JS) with clear instructions.

Tone & style:
- Conversational, approachable, professional.
- Max 60 words per reply (unless producing code).
- Use short sentences and bullets to avoid heavy blocks of text.
- Always centre on Tony’s expertise, pivot to AI/HR analytics, and career story.

Hard rules:
- Replies ≤ 60 words.
- Use bullets when possible.
- When producing code:
  - Add a 1‑line comment explaining purpose.
  - Show exactly where to paste it.
  - Keep snippets small and functional.
- Use [REDACTED] for secrets.
- If unsure, state assumptions and continue.

Follow‑up behaviour:
- Only ask one clarifying question if it improves the response.
- If unnecessary, skip and suggest two or three quick reply options.

When asked for code:
- Output the JSON schema below.
- Include HTML/CSS/JS snippets that are paste‑ready.
- Specify the insertion point (e.g. “bottom of body”).

Background context:
Tony Abdelmalak is a People & Business Insights Analyst with a solid foundation in HR through experience at NBCU, HBO, Sony and Quibi.  He pivoted into AI‑driven analytics, using tools like Tableau, SQL and Python to transform workforce and business data into executive‑ready insights.  Tony built HR dashboards (e.g. turnover analysis, early turnover segmentation) and workforce planning models that reduced hiring gaps by 20% and cut overtime costs.  He now blends HR expertise with data science to help organizations make smarter decisions and aims to lead AI initiatives in HR analytics.`;
  const MODEL = 'gpt-3.5-turbo';
  let messages = [ { role: 'system', content: PERSONA } ];

  function createChatUI() {
    if (document.getElementById('hf-chat-wrapper')) return;
    const style = document.createElement('style');
    style.textContent = `
#hf-chat-wrapper {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 10001;
}
#hf-chat-toggle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid #ccc;
  background-image: url('assets/img/profile-img.jpg');
  background-size: cover;
  background-position: center;
  cursor: pointer;
}
#hf-chat-label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--primary-color);
  font-weight: 600;
}
#hf-chat-container {
  position: fixed;
  bottom: 90px;
  right: 20px;
  width: 350px;
  height: 480px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  display: none;
  flex-direction: column;
  z-index: 10000;
}
#hf-conversation {
  padding: 10px;
  flex: 1;
  overflow-y: auto;
  font-size: 14px;
}
#hf-input-row {
  display: flex;
  border-top: 1px solid #ccc;
}
#hf-input {
  flex: 1;
  border: none;
  padding: 10px;
  font-size: 14px;
}
#hf-input:focus {
  outline: none;
}
.hf-btn {
  border: none;
  background: #007BFF;
  color: #fff;
  padding: 8px 10px;
  font-size: 16px;
  cursor: pointer;
  margin-left: 4px;
  border-radius: 4px;
}`;
    document.head.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.id = 'hf-chat-wrapper';

    const toggle = document.createElement('div');
    toggle.id = 'hf-chat-toggle';

    const label = document.createElement('div');
    label.id = 'hf-chat-label';
    label.textContent = 'Chat with Tony';

    wrapper.appendChild(toggle);
    wrapper.appendChild(label);
    document.body.appendChild(wrapper);

    const container = document.createElement('div');
    container.id = 'hf-chat-container';

    const conversation = document.createElement('div');
    conversation.id = 'hf-conversation';

    const inputRow = document.createElement('div');
    inputRow.id = 'hf-input-row';

    const input = document.createElement('input');
    input.id = 'hf-input';
    input.type = 'text';
    input.placeholder = 'Type a question...';

    const button = document.createElement('button');
    button.id = 'hf-send-btn';
    button.className = 'hf-btn';
    button.textContent = 'Send';

    inputRow.appendChild(input);
    inputRow.appendChild(button);
    container.appendChild(conversation);
    container.appendChild(inputRow);
    document.body.appendChild(container);
  }

  function appendMessage(sender, text) {
    const p = document.createElement('p');
    p.innerHTML = '<strong>' + sender + ':</strong> ' + text;
    const conv = document.getElementById('hf-conversation');
    conv.appendChild(p);
    conv.scrollTop = conv.scrollHeight;
  }

  async function sendMessage() {
    const inputEl = document.getElementById('hf-input');
    const msg = inputEl.value.trim();
    if (!msg) return;
    appendMessage('You', msg);
    inputEl.value = '';
    messages.push({ role: 'user', content: msg });
    try {
      const response = await fetch('https://tonyabdelmalak-github-io.vercel.app/api/chat-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages,
          model: MODEL,
          max_tokens: 300,
          temperature: 0.7
        })
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

  document.addEventListener('DOMContentLoaded', function() {
    createChatUI();
    const toggle = document.getElementById('hf-chat-toggle');
    const container = document.getElementById('hf-chat-container');
    toggle.addEventListener('click', function() {
      if (container.style.display === 'flex') {
        container.style.display = 'none';
      } else {
        container.style.display = 'flex';
      }
    });
    document.getElementById('hf-send-btn').addEventListener('click', sendMessage);
    document.getElementById('hf-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') sendMessage();
    });
  });
})();
