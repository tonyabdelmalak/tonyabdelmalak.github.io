// Chat Widget — /chat-widget/assets/chat/widget.js
// Mounts onto <div id="chat-widget-root"></div> and talks to your Worker.
// Sends message history, and locally renders a "topics" view when asked.

const TONY_TOPICS = [
  { title: "Real-world case studies", body: "Examples of dashboards, workforce models, and AI copilots I’ve built — and how they were used to make decisions." },
  { title: "Behind the scenes", body: "How I clean, structure, and shape messy datasets so they tell a clear story." },
  { title: "Career pivots", body: "What I learned moving from HR into analytics, and advice for making that shift." },
  { title: "The human side of data", body: "Blending analytics with emotional intelligence and storytelling so insights resonate." },
  { title: "Tools and workflows", body: "How I use Tableau, SQL, Python, and AI copilots day-to-day, and when I reach for each." },
  { title: "Future outlook", body: "Where AI is reshaping HR, workforce analytics, and decision-making — opportunities and challenges." }
];

const TONY_AVATAR_URL = "/assets/chat/tony-avatar.jpg";

// simple in-memory history shared per page load
const HISTORY = []; // {role:'user'|'assistant'|'system', content:'...'}

/* ----------------------------- BOOT ----------------------------- */

(async function boot() {
  const mount = ensureMount();
  const cfg = await loadConfig();
  applyTheme(cfg);

  const system = await fetchSystem(cfg.systemUrl);
  if (system) HISTORY.push({ role: "system", content: system });

  const { launcher, panel, closeBtn, scroll, note, form, input, send } = buildShell(cfg, mount);
  if (cfg.greeting) addAssistant(scroll, cfg.greeting);

  launcher.addEventListener('click', () => {
    panel.style.display = 'block';
    launcher.classList.add('cw-hidden');
    input.focus();
  });
  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
    launcher.classList.remove('cw-hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    addUser(scroll, text);
    HISTORY.push({ role: "user", content: text });
    input.value = '';
    input.focus();

    // Local intercept: topics
    if (wantsTopics(text)) {
      const stopTypingLocal = showTyping(scroll);
      await sleep(250);
      stopTypingLocal();
      renderTopicsInto(scroll);
      const ack = "Here are topics I’m happy to cover.";
      HISTORY.push({ role: "assistant", content: ack });
      scrollToEnd(scroll);
      return;
    }

    const stopTyping = showTyping(scroll);
    try {
      send.disabled = true;

      const res = await fetch(cfg.workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          system,
          model: cfg.model,
          temperature: cfg.temperature,
          history: HISTORY.slice(-12) // send last N messages
        }),
      });

      const data = await res.json().catch(() => ({}));
      const reply = res.ok && (data.text || data.reply || data.message);
      if (reply) {
        addAssistant(scroll, reply);
        HISTORY.push({ role: "assistant", content: reply });
      } else {
        const detail = data?.detail?.error?.message || data?.detail?.error?.code || data?.error || 'failed';
        addError(note, `Error: ${detail}`);
      }
    } catch (err) {
      addError(note, `Network error: ${String(err)}`);
    } finally {
      stopTyping();
      send.disabled = false;
      scrollToEnd(scroll);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });
})();

/* -------------------------- TOPICS RENDER -------------------------- */

function wantsTopics(t = "") {
  const s = t.toLowerCase().trim();
  return s === "/topics" ||
         /\b(topics?|what can (you|u) cover|what do you cover|what can you talk about|what else)\b/.test(s);
}

function renderTopicsInto(scrollEl) {
  const sep = document.createElement('div');
  sep.className = 'tny-section-sep';
  scrollEl.appendChild(sep);

  const root = document.createElement('div');
  root.className = 'tny-chat';

  root.appendChild(makeTopicBubble({
    who: 'tony',
    html: `<div class="tny-content"><h4>Hi, I’m Tony.</h4><p>Here are topics I’m happy to cover. Ask me about any of these and I’ll dive in.</p></div>`
  }));

  TONY_TOPICS.forEach(t => {
    root.appendChild(makeTopicBubble({
      who: 'tony',
      html: `<div class="tny-content"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.body)}</p></div>`
    }));
  });

  scrollEl.appendChild(root);
}

function makeTopicBubble({ who, html }) {
  const row = document.createElement('div');
  row.className = `tny-row tny-row--${who}`;

  const avatar = document.createElement('div');
  avatar.className = 'tny-avatar';
  if (who === 'tony' && TONY_AVATAR_URL) {
    avatar.style.backgroundImage = `url('${TONY_AVATAR_URL}')`;
  }

  const bubble = document.createElement('div');
  bubble.className = `tny-bubble tny-bubble--${who}`;
  bubble.innerHTML = html;

  row.appendChild(avatar);
  row.appendChild(bubble);
  return row;
}

/* --------------------------- HELPERS --------------------------- */

async function loadConfig() {
  try {
    const res = await fetch('/chat-widget/assets/chat/config.json', { cache: 'no-store' });
    return await res.json();
  } catch {
    return {
      workerUrl: '/chat',
      title: 'Chat',
      greeting: 'Hi! Ask me anything.',
      accent: '#4f46e5',
      radius: '14px',
      model: 'llama-3.1-8b-instant',
      temperature: 0.2,
      systemUrl: ''
    };
  }
}

function addAssistant(mount, text) {
  const row = document.createElement('div');
  row.className = 'cw-row bot';
  const bubble = document.createElement('div');
  bubble.className = 'cw-bubble';
  bubble.textContent = text;
  row.appendChild(bubble);
  mount.appendChild(row);
  scrollToEnd(mount);
}

function addUser(mount, text) {
  const row = document.createElement('div');
  row.className = 'cw-row user';
  row.innerHTML = `<div class="cw-bubble">${escapeHtml(text)}</div>`;
  mount.appendChild(row);
  scrollToEnd(mount);
}

function applyTheme(cfg = {}) {
  const root = document.documentElement;
  const accent = (cfg.brand && cfg.brand.accent) || cfg.accent || '#4f46e5';
  const radius = (cfg.brand && cfg.brand.radius) || cfg.radius || '14px';
  root.style.setProperty('--chat-accent', accent);
  root.style.setProperty('--chat-radius', radius);
}

function ensureMount() {
  let root = document.querySelector('#chat-widget-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'chat-widget-root';
    document.body.appendChild(root);
  }
  return root;
}

function addError(noteEl, msg) {
  noteEl.textContent = msg;
  setTimeout(() => (noteEl.textContent = ''), 6000);
}

function showTyping(mount) {
  const row = document.createElement('div');
  row.className = 'cw-row bot';
  row.innerHTML = `
    <div class="cw-bubble">
      <span class="cw-typing">
        <span class="cw-dot"></span><span class="cw-dot"></span><span class="cw-dot"></span>
      </span>
    </div>`;
  mount.appendChild(row);
  scrollToEnd(mount);
  return () => row.remove();
}

function scrollToEnd(el) { el.scrollTop = el.scrollHeight; }

function escapeHtml(s='') {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function fetchSystem(url) {
  if (!url) return '';
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return '';
    const text = await r.text();
    return (text || '').toString().slice(0, 12000);
  } catch {
    return '';
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
