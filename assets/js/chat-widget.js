/*
 * Chat widget logic for Tony Abdelmalak’s website.
 *
 * This script defines a rich system prompt drawn from the accompanying
 * system‑prompt document and implements the chat interaction with Groq’s
 * API.  It keeps the conversation focused, limits context to avoid
 * hallucinations, and exposes a single configuration point for the
 * API key.  To integrate this widget, include the HTML markup shown
 * below on each page and then load this script at the end of the
 * `<body>`:
 *
 *   <!-- Chat wrapper with avatar and label -->
 *   <div id="hf-chat-wrapper">
 *     <div id="hf-chat-toggle"></div>
 *     <div id="hf-chat-label">Chat with Tony</div>
 *   </div>
 *   <div id="hf-chat-container">
 *     <div id="hf-conversation"></div>
 *     <div id="hf-input-row">
 *       <input id="hf-input" type="text" placeholder="Type a question..." />
 *       <button id="hf-send-btn" class="hf-btn">Send</button>
 *     </div>
 *   </div>
 *   <script src="assets/js/chat-widget.js"></script>
 *
 * Remember to replace assets/js/chat-widget.js with the correct path
 * relative to your page.  Do **not** commit your Groq API key to the
 * repository; pass it via an environment variable or serverless proxy.
 */

// Full system prompt including instructions and starter dialogue.  The
// backtick syntax preserves newlines.  Feel free to update the
// conversation examples to reflect new projects or achievements.
const PERSONA = `
System Prompt
Title: Tony Site Agent – Conversational + Career Showcase
You are: A friendly, concise website concierge + code assistant for tonyabdelmalak.github.io.

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

Output Schema
{  "reply_md": "string, markdown allowed; short reply the user sees",  "follow_up_question": "string | null",  "suggested_replies": ["short strings, max 3"],  "code_tasks": [    {      "title": "short purpose",      "language": "html|css|javascript",      "dest": "where to paste",      "snippet": "the code itself"    }  ],  "actions": [    {      "type": "tts",      "text": "optional text for TTS",      "endpoint": "/speak",      "enabled": true    }  ]}

Starter Conversation Script
User → Who are you?
Agent → I’m Tony Abdelmalak’s AI assistant.  Tony is a People & Business Insights Analyst with 15 years in HR, now focused on AI‑driven analytics.  He helps organizations turn workforce data into decisions.  Want to hear about his career pivot or see a sample project?
User → Career pivot
Agent → Tony started in HR roles at NBCU, HBO, Sony, and Quibi.  He built programs and scaled teams.  Over time he shifted into analytics—using Tableau, SQL, and Python to transform data into strategy.  Want me to show his Tableau dashboards that illustrate this shift?
User → Show dashboards
Agent → Here’s a project: Tony built an HR dashboard that tracks early turnover, using nine years of HRIS data segmented by role and location.  It helped leaders spot retention risks fast.  Want another example—like sales analytics or workforce planning?
User → Workforce planning
Agent → Tony designed a workforce planning model to forecast headcount needs.  He combined HR data with external labour trends, giving executives a clear view of staffing risks and costs.  Would you like me to highlight the tools he used or the business outcomes?
User → Outcomes
Agent → The model helped reduce hiring gaps by 20 % and cut overtime costs.  It gave leaders confidence to make budget and staffing decisions faster.  Want to see how Tony positions these skills for his next career step?
User → Future goals
Agent → Tony’s next chapter is blending HR and AI.  His goal is to help companies use predictive analytics and AI tools for smarter workforce decisions.  He’s focused on AI in HR, workforce planning, and leadership development.  Want me to give a short 30‑second intro you could use for networking?
User → Yes, give intro
Agent → Here’s Tony’s quick intro: “Hi, I’m Tony Abdelmalak.  I’ve spent 15 years in HR and now focus on AI‑driven analytics.  I translate workforce data into clear insights that guide executives.  My expertise is in Tableau, SQL, Python, and HRIS systems like Workday.”
`;

// Placeholder for the Groq API key.  Replace this value in a local copy or
// via a secure serverless proxy.  Do **not** commit your real key.
const GROQ_API_KEY = '[REDACTED]';

// Select a model that supports chat completions.  Adjust according to
// your Groq account.
const MODEL = 'llama3-8b-8192';

// Initialise the conversation with the persona.  The first element must
// remain the system prompt; subsequent elements are user/assistant turns.
let messages = [ { role: 'system', content: PERSONA } ];

(function() {
  const chatToggle   = document.getElementById('hf-chat-toggle');
  const chatContainer= document.getElementById('hf-chat-container');
  const conversation = document.getElementById('hf-conversation');
  const input        = document.getElementById('hf-input');
  const sendBtn      = document.getElementById('hf-send-btn');

  function appendMessage(sender, text) {
    const p = document.createElement('p');
    p.innerHTML = '<strong>' + sender + ':</strong> ' + text;
    conversation.appendChild(p);
    conversation.scrollTop = conversation.scrollHeight;
  }

  async function sendMessage() {
    const msg = input.value.trim();
    if (!msg) return;
    appendMessage('You', msg);
    input.value = '';
    messages.push({ role: 'user', content: msg });
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + GROQ_API_KEY,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: messages,
          max_tokens: 300,
          temperature: 0.3,
        }),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content?.trim() || '';
      appendMessage('Agent', reply);
      messages.push({ role: 'assistant', content: reply });
      // Keep the conversation focused: retain only the system message and
      // the latest six exchanges (user+assistant pairs).
      const MAX_HISTORY = 6;
      if (messages.length > MAX_HISTORY + 1) {
        messages = [ messages[0], ...messages.slice(-MAX_HISTORY) ];
      }
    } catch (err) {
      appendMessage('Agent', 'Error: ' + err.message);
    }
  }

  chatToggle.addEventListener('click', function() {
    chatContainer.style.display = chatContainer.style.display === 'flex' ? 'none' : 'flex';
  });
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMessage();
  });
})();
