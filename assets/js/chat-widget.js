/*
 Chat widget script for Tony Abdelmalak's website.
 Updated to send messages and maintain persona context via proxy.
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

  function $id(id) { return document.getElementById(id); }

  function appendMessage(sender, text) {
    const p = document.createElement('p');
    p.innerHTML = '<strong>' + sender + ':</strong> ' + text;
    const conversation = $id('hf-conversation');
    conversation.appendChild(p);
    conversation.scrollTop = conversation.scrollHeight;
  }

  async function sendMessage() {
    const input = $id('hf-input');
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
          messages: messages,
          model: MODEL,
          max_tokens: 300,
          temperature: 0.7,
        }),
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

  function init() {
    const chatToggle = $id('hf-chat-toggle');
    const chatContainer = $id('hf-chat-container');
    const sendBtn = $id('hf-send-btn');
    const input = $id('hf-input');
    if (!chatToggle || !chatContainer || !sendBtn || !input) {
      console.error('[chat] missing elements');
      return;
    }
    chatToggle.addEventListener('click', () => {
      chatContainer.style.display = chatContainer.style.display === 'flex' ? 'none' : 'flex';
    });
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') sendMessage();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
