(function() {
async function getJSON(url) {
  const r = await fetch(url, { cache: \"no-store\" });
  return r.ok ? r.json() : null;
}

function createEl(tag, cls) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  return el;
}

class ChatWidget {
  constructor(conf, persona) {
    this.conf = conf;
    this.persona = persona;
    this.SYSTEM_PROMPT = persona ? JSON.stringify(persona) : \"Hi, I'm Tony.\";
    this.launcher = null;
    this.panel = null;
    this.messages = [];
  }

  init() {
    this.launcher = createEl('div', 'tcw-launcher');
    document.body.appendChild(this.launcher);
    this.panel = createEl('div', 'tcw-panel');
    this.panel.style.display = 'none';
    document.body.appendChild(this.panel);

    const header = createEl('div', 'tcw-header');
    const title = createEl('div', 'tcw-title');
    title.textContent = this.conf.title || 'Chat';
    header.appendChild(title);
    this.panel.appendChild(header);

    const body = createEl('div', 'tcw-body');
    const messagesEl = createEl('div', 'tcw-messages');
    body.appendChild(messagesEl);
    this.panel.appendChild(body);
    this.messagesEl = messagesEl;

    const inputBar = createEl('div', 'tcw-inputbar');
    const textarea = document.createElement('textarea');
    textarea.rows = 1;
    textarea.placeholder = 'Type a question…';
    inputBar.appendChild(textarea);
    const sendBtn = document.createElement('button');
    sendBtn.textContent = 'Send';
    inputBar.appendChild(sendBtn);
    this.panel.appendChild(inputBar);

    this.textarea = textarea;
    this.sendBtn = sendBtn;

    if (this.conf.intro_once && !sessionStorage.getItem('tcw_greeted')) {
      sessionStorage.setItem('tcw_greeted', '1');
      if (this.conf.firstMessage) {
        this.addMsg('assistant', this.conf.firstMessage);
      }
    }

    this.launcher.addEventListener('click', () => {
      this.panel.style.display = this.panel.style.display === 'none' ? 'flex' : 'none';
      if (this.panel.style.display === 'flex') {
        this.textarea.focus();
      }
    });

    this.sendBtn.addEventListener('click', () => this.send());
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });
  }

  addMsg(sender, text) {
    const row = createEl('div', 'tcw-msg');
    const strong = document.createElement('strong');
    strong.textContent = sender === 'assistant' ? 'Tony: ' : 'You: ';
    row.appendChild(strong);
    row.appendChild(document.createTextNode(text));
    this.messagesEl.appendChild(row);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  collectHistory() {
    const history = [];
    this.messagesEl.querySelectorAll('.tcw-msg').forEach(row => {
      const strong = row.querySelector('strong');
      const text = row.textContent;
      if (strong && text) {
        const sender = strong.textContent.trim().replace(':', '').toLowerCase();
        const content = text.replace(strong.textContent, '').trim();
        history.push({ role: sender === 'tony' ? 'assistant' : 'user', content });
      }
    });
    return history;
  }

  async send() {
    const msg = this.textarea.value.trim();
    if (!msg) return;
    this.addMsg('user', msg);
    this.textarea.value = '';
    const history = this.collectHistory();
    const messages = [
      { role: 'system', content: this.SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: msg }
    ];
    try {
      const res = await fetch(this.conf.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.conf.model,
          messages,
          temperature: 0.3,
          max_tokens: 400
        })
      });
      const data = await res.json();
      const reply = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content.trim() : '';
      this.addMsg('assistant', reply);
    } catch (e) {
      this.addMsg('assistant', 'Error: ' + e.message);
    }
  }
}

(async () => {
  const confRes = await getJSON('/assets/chat/config.json');
  const personaRes = await getJSON('/assets/chat/persona.json');
  const chat = new ChatWidget(confRes || {}, personaRes);
  chat.init();
})();
})();
