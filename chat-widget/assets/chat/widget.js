// Chat Widget — /chat-widget/assets/chat/widget.js
// Mounts onto <div id="chat-widget-root"></div> and talks to your Worker.
// Adds client-side "topics" rendering in conversational bubbles (no upstream call needed).

const TONY_TOPICS = [
  {
    title: "Real-world case studies",
    body:
      "Examples of dashboards, workforce models, and AI copilots I’ve built — and how people actually used them to make better decisions."
  },
  {
    title: "Behind the scenes",
    body:
      "Messy datasets are the norm. I’ll walk through how I clean, structure, and shape data so it tells a clear story."
  },
  {
    title: "Career pivots",
    body:
      "What I learned moving from HR into analytics, plus practical advice for anyone considering a similar shift."
  },
  {
    title: "The human side of data",
    body:
      "Numbers alone don’t change minds. I blend analytics with emotional intelligence and storytelling to make insights stick."
  },
  {
    title: "Tools and workflows",
    body:
      "How I use Tableau, SQL, Python, and AI copilots day-to-day, and when I reach for each."
  },
  {
    title: "Future outlook",
    body:
      "Where I see AI reshaping HR, workforce analytics, and decision-making — and the opportunities and challenges ahead."
  }
];

// Optional avatar for the topics bubbles (set to your image path or leave blank)
const TONY_AVATAR_URL = "/assets/chat/tony-avatar.jpg";

/* ----------------------------- BOOT ----------------------------- */

(async function boot() {
  const mount = ensureMount();
  const cfg = await loadConfig();
  applyTheme(cfg);

  // Preload system persona text (cached per page load)
  const system = await fetchSystem(cfg.systemUrl);

  // Build UI
  const { launcher, panel, closeBtn, scroll, note, form, input, send } = buildShell(cfg, mount);
  if (cfg.greeting) addBot(scroll, cfg.greeting);

  // Open/close
  launcher.addEventListener('click', () => {
    panel.style.display = 'block';
    launcher.classList.add('cw-hidden');
    input.focus();
  });
  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
    launcher.classList.remove('cw-hidden');
  });

  // Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    addUser(scroll, text);
    input.value = '';
    input.focus();

    // Local intercept: show topics bubbles if user asks about topics
    if (wantsTopics(text)) {
      const stopTypingLocal = showTyping(scroll);
      await sleep(300); // tiny delay for UX
      stopTypingLocal();
      renderTopicsInto(scroll);
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
          system,                      // persona injected here
          model: cfg.model,
          temperature: cfg.temperature
          // history: []                // optionally include your own message history array
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.text || data.reply || data.message)) {
        addBot(scroll, data.text || data.reply || data.message);
      } else {
        const detail =
          data?.detail?.error?.message ||
          data?.detail?.error?.code ||
          data?.error ||
          'failed';
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

  // Enter to send, Shift+Enter for newline
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });
})();

/* -------------------------- TOPICS RENDER -------------------------- */

function wantsTopics(t = "") {
  const s = t.toLowerCase();
  return /\b(topics?|what can (you|u) cover|what do you cover|what can you talk about|what can we talk about|what else)\b/.test(s)
      || s === "/topics";
}

function renderTopicsInto(scrollEl) {
  // small spacer
  const sep = document.createElement('div');
  sep.className = 'tny-section-sep';
  scrollEl.appendChild(sep);

  const root = document.createElement('div');
  root.className = 'tny-chat';

  // greeting bubble
  root.appendChild(makeTopicBubble({
    who: 'tony',
    html: `<h4>Hi, I’m Tony.</h4><p>Here are topics I’m happy to cover. Ask me about any of these and I’ll dive in.</p>`
  }));

  // each topic
  TONY_TOPICS.forEach(t => {
    root.appendChild(makeTopicBubble({
      who: 'tony',
      html: `<h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.body)}</p>`
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

  const content = document.createElement('div');
  content.className = 'tny-content';
  content.innerHTML = html;

  bubble.appendChild(content);
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

function wordClamp(s, n = 60) {
  const parts = (s || "").split(/\s+/);
  return parts.length <= n ? s : parts.slice(0, n).join(" ") + "…";
}

function addBot(mount, text) {
  const row = document.createElement('div');
  row.className = 'cw-row bot';
  const bubble = document.createElement('div');
  bubble.className = 'cw-bubble';
  bubble.textContent = wordClamp(text); // hard cap ~60 words
  row.appendChild(bubble);
  mount.appendChild(row);
  scrollToEnd(mount);
}

function applyTheme(cfg = {}) {
  const root = document.documentElement;
  root.style.setProperty('--chat-accent', (cfg.brand && cfg.brand.accent) || cfg.accent || '#4f46e5');
  root.style.setProperty('--chat-radius', (cfg.brand && cfg.brand.radius) || cfg.radius || '14px');
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

function buildShell(cfg, mount) {
  mount.innerHTML = `
    <button class="cw-launcher" id="cw-launch" aria-label="Open chat">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3C7.03 3 3 6.58 3 11a7.6 7.6 0 0 0 2.1 5.1l-.7 3.2c-.1.5.36.95.85.83l3.7-.93A10.8 10.8 0 0 0 12 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" fill="currentColor"/></svg>
    </button>

    <div class="cw-wrap" id="cw-panel" role="dialog" aria-label="Chat">
      <div class="cw-head">
        <button class="cw-close" id="cw-close" aria-label="Close">✕</button>
        <h3 class="cw-title" id="cw-title">${escapeHtml(cfg.title || "Thanks for taking the time to chat. What's on your mind?")}</h3>
        <p class="cw-sub" id="cw-sub">Feel free to ask me (mostly) anything.</p>
      </div>
      <div class="cw-body">
        <div class="cw-scroll" id="cw-scroll"></div>
        <div class="cw-note" id="cw-note"></div>
        <form class="cw-input" id="cw-form">
          <input id="cw-text" type="text" autocomplete="off" placeholder="Type a message…" />
          <button class="cw-send" id="cw-send" type="submit">Send</button>
        </form>
      </div>
    </div>
  `;

  return {
    launcher: mount.querySelector('#cw-launch'),
    panel: mount.querySelector('#cw-panel'),
    closeBtn: mount.querySelector('#cw-close'),
    scroll: mount.querySelector('#cw-scroll'),
    note: mount.querySelector('#cw-note'),
    form: mount.querySelector('#cw-form'),
    input: mount.querySelector('#cw-text'),
    send: mount.querySelector('#cw-send')
  };
}

function addUser(mount, text) {
  const row = document.createElement('div');
  row.className = 'cw-row user';
  row.innerHTML = `<div class="cw-bubble">${escapeHtml(text)}</div>`;
  mount.appendChild(row);
  scrollToEnd(mount);
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

function scrollToEnd(el) {
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s='') {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function fetchSystem(url) {
  if (!url) return '';
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return '';
    const text = await r.text();
    return (text || '').toString().slice(0, 12000); // trim for safety
  } catch {
    return '';
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
