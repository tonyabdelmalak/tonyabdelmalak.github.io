// Chat Widget — /chat-widget/assets/chat/widget.js
// Vanilla JS floating chat that talks to your Cloudflare Worker.
// Consistent formatting + optional persona/sources context (RAG-lite).
// Keeps your existing folder tree & paths intact.

/* ===================== Config & State ===================== */

const TONY_TOPICS = [
  { title: "Real-world case studies", body: "Examples of dashboards, workforce models, and AI copilots I’ve built — and how they were used to make decisions." },
  { title: "Behind the scenes", body: "How I clean, structure, and shape messy datasets so they tell a clear story." },
  { title: "Career pivots", body: "What I learned moving from HR into analytics, and advice for making that shift." },
  { title: "The human side of data", body: "Blending analytics with emotional intelligence and storytelling so insights resonate." },
  { title: "Tools and workflows", body: "How I use Tableau, SQL, Python, and AI copilots day-to-day, and when I reach for each." },
  { title: "Future outlook", body: "Where AI is reshaping HR, workforce analytics, and decision-making — opportunities and challenges." }
];

var TONY_AVATAR_URL = "/assets/img/profile-img.jpg"; // your profile pic
var HISTORY = [];                // only user/assistant turns
var __TONY_PERSONA__ = {};       // from persona.json
var __TONY_SOURCES__ = [];       // from sources.json or persona.links

/* ===================== Boot ===================== */

(function boot() {
  try {
    var mount = ensureMount();
    loadConfig().then(function (cfg) {
      applyTheme(cfg);
      fetchSystem(cfg.systemUrl).then(function (system) {
        Promise.all([
          fetchJSON('/chat-widget/assets/chat/persona.json').catch(() => ({})),
          fetchJSON('/chat-widget/assets/chat/sources.json').catch(() => ({}))
        ]).then(function (arr) {
          __TONY_PERSONA__ = arr[0] || {};
          var sourcesCfg = arr[1] || {};
          var fromFile = Array.isArray(sourcesCfg.sources) ? sourcesCfg.sources : [];
          var derived = deriveSourcesFromPersona(__TONY_PERSONA__);
          var effectiveSources = (fromFile.length ? fromFile : derived);

          loadSources(effectiveSources, (sourcesCfg && sourcesCfg.maxBytesPerSource) || 12000)
            .then(function (loadedSources) {
              __TONY_SOURCES__ = loadedSources || [];

              var ui = buildShell(cfg, mount);

              // Avatar launcher
              ui.launcher.classList.add('cw-launcher--avatar');
              ui.launcher.innerHTML = `
                <div class="cw-avatar-wrapper" aria-label="Open chat with Tony">
                  <img src="${TONY_AVATAR_URL}" alt="Tony" class="cw-avatar-img" />
                  <div class="cw-avatar-bubble" title="Chat">💬</div>
                </div>
              `;

              injectStyles();
              if (cfg.greeting) addAssistant(ui.scroll, cfg.greeting);

              // open/close
              ui.launcher.addEventListener('click', function () {
                ui.panel.style.display = 'block';
                ui.launcher.classList.add('cw-hidden');
                ui.input.focus();
              });
              ui.closeBtn.addEventListener('click', function () {
                ui.panel.style.display = 'none';
                ui.launcher.classList.remove('cw-hidden');
              });

              // submit
              ui.form.addEventListener('submit', function (e) {
                e.preventDefault();
                var text = (ui.input.value || "").trim();
                if (!text) return;

                addUser(ui.scroll, text);
                HISTORY.push({ role: "user", content: text });
                ui.input.value = "";
                ui.input.focus();

                // /topics shortcut
                if (wantsTopics(text)) {
                  var stopTypingLocal = showTyping(ui.scroll);
                  sleep(250).then(function () {
                    stopTypingLocal();
                    renderTopicsInto(ui.scroll);
                    HISTORY.push({ role: "assistant", content: "Here are topics I’m happy to cover." });
                    scrollToEnd(ui.scroll);
                  });
                  return;
                }

                var stopTyping = showTyping(ui.scroll);
                ui.send.disabled = true;

                // Send to Worker
                safeFetch(cfg.workerUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    message: text,
                    system: system,
                    model: cfg.model,          // Worker ignores this, server enforces pinned model
                    temperature: cfg.temperature,
                    history: HISTORY.slice(-12),
                    context: {
                      persona: __TONY_PERSONA__,
                      sources: __TONY_SOURCES__,
                      creative_mode: true
                    }
                  })
                })
                .then(function (res) {
                  if (res.ok) return res.json().catch(() => ({}));
                  return res.text().then(function (txt) { throw new Error("HTTP " + res.status + ": " + txt); });
                })
                .then(function (data) {
                  var raw =
                    (data && (data.text || data.reply || data.message || data.content)) ||
                    (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
                    "";
                  if (!raw) return addError(ui.note, "Error: invalid response");
                  var html = formatAssistant(raw);
                  addAssistantHTML(ui.scroll, html);
                  HISTORY.push({ role: "assistant", content: stripHtml(html) });
                })
                .catch(function (err) {
                  addError(ui.note, "Network error: " + String(err && err.message || err));
                })
                .finally(function () {
                  stopTyping();
                  ui.send.disabled = false;
                  scrollToEnd(ui.scroll);
                });
              });

              ui.input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ui.form.dispatchEvent(new Event('submit'));
                }
              });
            });
        });
      });
    });
  } catch (err) {
    console.error("[widget] boot error:", err);
  }
})();

/* ===================== Persona Sources ===================== */

function deriveSourcesFromPersona(persona) {
  try {
    var out = [];
    var links = (persona && persona.links) || {};
    if (links.home)       out.push({ title: "Home",       url: links.home });
    if (links.dashboards) out.push({ title: "Dashboards", url: links.dashboards });
    if (links.caseStudies)out.push({ title: "Case Study", url: links.caseStudies });
    if (links.resume)     out.push({ title: "Resume",     url: links.resume });
    return out;
  } catch (e) {
    return [];
  }
}

/* ===================== Fetch & Sources ===================== */

function fetchJSON(url) {
  return safeFetch(url, { cache: 'no-store' })
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({}));
}

function loadSources(sourcesList, maxBytesPerSource) {
  var list = Array.isArray(sourcesList) ? sourcesList : [];
  if (!list.length) return Promise.resolve([]);
  var tasks = list.map(item => {
    var url = item && item.url;
    if (!url) return Promise.resolve(null);
    return fetch(url, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error("Fetch fail " + r.status);
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) return r.text().then(htmlToText);
        if (ct.includes('text/plain') || ct.includes('text/markdown')) return r.text();
        return "";
      })
      .then(txt => {
        txt = (txt || "").replace(/\s{2,}/g, " ").trim();
        if (!txt) return null;
        var cap = maxBytesPerSource || 12000;
        if (txt.length > cap) txt = txt.slice(0, cap);
        var chunks = chunkText(txt, 1200, 200);
        return { title: item.title || url, url: url, chunks: chunks };
      })
      .catch(() => null);
  });
  return Promise.all(tasks).then(arr => arr.filter(Boolean));
}

function htmlToText(html) {
  try {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    ['script','style','noscript','template','iframe'].forEach(sel => {
      doc.querySelectorAll(sel).forEach(n => n.remove());
    });
    var main = doc.querySelector('main') || doc.body;
    var text = main.textContent || "";
    return text.replace(/\s{2,}/g, " ").trim();
  } catch (e) {
    return (html || "").replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
  }
}

function chunkText(s, size, overlap) {
  var out = [], i = 0, n = s.length, ov = overlap || 0;
  while (i < n) {
    var end = Math.min(i + size, n);
    out.push(s.slice(i, end));
    if (end === n) break;
    i = end - ov;
    if (i < 0) i = 0;
  }
  return out;
}

/* ===================== Formatter ===================== */

function formatAssistant(text) {
  var t = (text || "").trim();
  t = t.replace(/\r\n/g, "\n")
       .replace(/\t/g, " ")
       .replace(/\u2022/g, "- ")
       .replace(/\s{2,}/g, " ")
       .replace(/\n{3,}/g, "\n\n");
  t = escapeHtml(t);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return "<p>" + t.split(/\n+/).map(s => s.trim()).filter(Boolean).join("</p><p>") + "</p>";
}

function stripHtml(html) {
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

/* ===================== Topics ===================== */

function wantsTopics(t) {
  var s = (t || "").toLowerCase().trim();
  return s === "/topics" ||
         /\b(topics?|what can (you|u) cover|what do you cover|what can you talk about|what else)\b/.test(s);
}

function renderTopicsInto(scrollEl) {
  var sep = document.createElement('div');
  sep.className = 'tny-section-sep';
  scrollEl.appendChild(sep);
  var root = document.createElement('div');
  root.className = 'tny-chat';
  root.appendChild(makeTopicBubble({
    who: 'tony',
    html: '<div class="tny-content"><h4>Hi, I’m Tony.</h4><p>Here are topics I’m happy to cover. Ask me about any of these and I’ll dive in.</p></div>'
  }));
  for (var i = 0; i < TONY_TOPICS.length; i++) {
    var t = TONY_TOPICS[i];
    root.appendChild(makeTopicBubble({
      who: 'tony',
      html: '<div class="tny-content"><h4>' + escapeHtml(t.title) + '</h4><p>' + escapeHtml(t.body) + '</p></div>'
    }));
  }
  scrollEl.appendChild(root);
}

function makeTopicBubble(opts) {
  var row = document.createElement('div');
  row.className = 'tny-row tny-row--' + opts.who;
  var avatar = document.createElement('div');
  avatar.className = 'tny-avatar';
  if (opts.who === 'tony' && TONY_AVATAR_URL) {
    avatar.style.backgroundImage = "url('" + TONY_AVATAR_URL + "')";
  }
  var bubble = document.createElement('div');
  bubble.className = 'tny-bubble tny-bubble--' + opts.who;
  bubble.innerHTML = opts.html;
  row.appendChild(avatar);
  row.appendChild(bubble);
  return row;
}

/* ===================== DOM + UI ===================== */

function ensureMount() {
  var root = document.querySelector('#chat-widget-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'chat-widget-root';
    document.body.appendChild(root);
  }
  return root;
}

function buildShell(cfg, mount) {
  mount.innerHTML =
    '<button class="cw-launcher" id="cw-launch" aria-label="Open chat">' +
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M12 3C7.03 3 3 6.58 3 11a7.6 7.6 0 0 0 2.1 5.1l-.7 3.2c-.1.5.36.95.85.83l3.7-.93A10.8 10.8 0 0 0 12 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" fill="currentColor"/>' +
      '</svg>' +
    '</button>' +
    '<div class="cw-wrap" id="cw-panel" role="dialog" aria-label="Chat">' +
      '<div class="cw-head">' +
        '<button class="cw-close" id="cw-close" aria-label="Close">✕</button>' +
        '<h3 class="cw-title" id="cw-title">' + escapeHtml(cfg.title || "What\'s on your mind?") + '</h3>' +
        '<p class="cw-sub" id="cw-sub">Feel free to ask me (mostly) anything.</p>' +
      '</div>' +
      '<div class="cw-body">' +
        '<div class="cw-scroll" id="cw-scroll"></div>' +
        '<div class="cw-note" id="cw-note"></div>' +
        '<form class="cw-input" id="cw-form">' +
          '<input id="cw-text" type="text" autocomplete="off" placeholder="Type a message…"/>' +
          '<button class="cw-send" id="cw-send" type="submit">Send</button>' +
        '</form>' +
      '</div>' +
    '</div>';
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

function addAssistant(mount, text) {
  var row = document.createElement('div');
  row.className = 'cw-row bot';
  var bubble = document.createElement('div');
  bubble.className = 'cw-bubble';
  bubble.textContent = text;
  row.appendChild(bubble);
  mount.appendChild(row);
  scrollToEnd(mount);
}

function addAssistantHTML(mount, html) {
  var row = document.createElement('div');
  row.className = 'cw-row bot';
  var bubble = document.createElement('div');
  bubble.className = 'cw-bubble';
  bubble.innerHTML = html;
  row.appendChild(bubble);
  mount.appendChild(row);
  scrollToEnd(mount);
}

function addUser(mount, text) {
  var row = document.createElement('div');
  row.className = 'cw-row user';
  row.innerHTML = '<div class="cw-bubble">' + escapeHtml(text) + '</div>';
  mount.appendChild(row);
  scrollToEnd(mount);
}

/* ===================== Config, System, Net ===================== */

function loadConfig() {
  return fetch('/chat-widget/assets/chat/config.json', { cache: 'no-store' })
    .then(res => res.ok ? res.json() : fetch('chat-widget/assets/chat/config.json', { cache: 'no-store' }).then(r2 => r2.ok ? r2.json() : {}))
    .catch(() => ({
      workerUrl: '/chat',
      title: 'Chat',
      greeting: '',
      brand: { accent: '#3e5494', radius: '14px' },
      model: 'qwen/qwen-2.5-7b-instruct',
      temperature: 0.2,
      systemUrl: '/chat-widget/assets/chat/system.md'
    }));
}

function applyTheme(cfg) {
  var accent = (cfg.brand && cfg.brand.accent) || '#3e5494';
  var radius = (cfg.brand && cfg.brand.radius) || '14px';
  var root = document.documentElement;
  root.style.setProperty('--chat-accent', accent);
  root.style.setProperty('--chat-radius', radius);
}

function addError(noteEl, msg) {
  noteEl.textContent = msg;
  setTimeout(() => { noteEl.textContent = ''; }, 6000);
}

function showTyping(mount) {
  var row = document.createElement('div');
  row.className = 'cw-row bot';
  row.innerHTML =
    '<div class="cw-bubble"><span class="cw-typing"><span class="cw-dot"></span><span class="cw-dot"></span><span class="cw-dot"></span></span></div>';
  mount.appendChild(row);
  scrollToEnd(mount);
  return () => { row.remove(); };
}

function scrollToEnd(el) { el.scrollTop = el.scrollHeight; }

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}

function fetchSystem(url) {
  if (!url) return Promise.resolve('');
  return safeFetch(url, { cache: '
