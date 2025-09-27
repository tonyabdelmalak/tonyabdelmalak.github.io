
// Chat Widget — /chat-widget/assets/chat/widget.js
// Vanilla JS, no modules. Renders a floating chat + sends requests to your Cloudflare Worker.
// Also renders a local "topics" view when the user asks for topics.

/* ===================== Config & State ===================== */

const TONY_TOPICS = [
  { title: "Real-world case studies", body: "Examples of dashboards, workforce models, and AI copilots I’ve built — and how they were used to make decisions." },
  { title: "Behind the scenes", body: "How I clean, structure, and shape messy datasets so they tell a clear story." },
  { title: "Career pivots", body: "What I learned moving from HR into analytics, and advice for making that shift." },
  { title: "The human side of data", body: "Blending analytics with emotional intelligence and storytelling so insights resonate." },
  { title: "Tools and workflows", body: "How I use Tableau, SQL, Python, and AI copilots day-to-day, and when I reach for each." },
  { title: "Future outlook", body: "Where AI is reshaping HR, workforce analytics, and decision-making — opportunities and challenges." }
];

var TONY_AVATAR_URL = "/assets/chat/tony-avatar.jpg"; // replace if you have a different path
var HISTORY = []; // {role:'user'|'assistant'|'system', content:'...'}

/* ===================== Boot ===================== */

(function boot() {
  try {
    var mount = ensureMount();
    loadConfig().then(function (cfg) {
      applyTheme(cfg);
      fetchSystem(cfg.systemUrl).then(function (system) {
        if (system) HISTORY.push({ role: "system", content: system });

        var ui = buildShell(cfg, mount);
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

          // Local "topics" intercept
          if (wantsTopics(text)) {
            var stopTypingLocal = showTyping(ui.scroll);
            sleep(250).then(function () {
              stopTypingLocal();
              renderTopicsInto(ui.scroll);
              var ack = "Here are topics I’m happy to cover.";
              HISTORY.push({ role: "assistant", content: ack });
              scrollToEnd(ui.scroll);
            });
            return;
          }

          var stopTyping = showTyping(ui.scroll);
          ui.send.disabled = true;

          // send to Worker
          safeFetch(cfg.workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: text,
              system: system,
              model: cfg.model,
              temperature: cfg.temperature,
              history: HISTORY.slice(-12)
            })
          }).then(function (res) {
            return res.ok ? res.json().catch(function(){ return {}; }) : res.text().then(function(txt){
              throw new Error("HTTP " + res.status + ": " + txt);
            });
          }).then(function (data) {
            var reply = data && (data.text || data.reply || data.message);
            if (reply) {
              addAssistant(ui.scroll, reply);
              HISTORY.push({ role: "assistant", content: reply });
            } else {
              addError(ui.note, "Error: invalid response");
            }
          }).catch(function (err) {
            addError(ui.note, "Network error: " + String(err && err.message || err));
          }).finally(function () {
            stopTyping();
            ui.send.disabled = false;
            scrollToEnd(ui.scroll);
          });
        });

        // Enter to send, Shift+Enter for newline
        ui.input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            ui.form.dispatchEvent(new Event('submit'));
          }
        });
      });
    });
  } catch (err) {
    console.error("[widget] boot error:", err);
  }
})();

/* ===================== Topics Render ===================== */

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
  mount.innerHTML = ''
    + '<button class="cw-launcher" id="cw-launch" aria-label="Open chat">'
    + '  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'
    + '    <path d="M12 3C7.03 3 3 6.58 3 11a7.6 7.6 0 0 0 2.1 5.1l-.7 3.2c-.1.5.36.95.85.83l3.7-.93A10.8 10.8 0 0 0 12 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" fill="currentColor"/>'
    + '  </svg>'
    + '</button>'
    + '<div class="cw-wrap" id="cw-panel" role="dialog" aria-label="Chat">'
    + '  <div class="cw-head">'
    + '    <button class="cw-close" id="cw-close" aria-label="Close">✕</button>'
    + '    <h3 class="cw-title" id="cw-title">' + escapeHtml(cfg.title || "What\'s on your mind?") + '</h3>'
    + '    <p class="cw-sub" id="cw-sub">Feel free to ask me (mostly) anything.</p>'
    + '  </div>'
    + '  <div class="cw-body">'
    + '    <div class="cw-scroll" id="cw-scroll"></div>'
    + '    <div class="cw-note" id="cw-note"></div>'
    + '    <form class="cw-input" id="cw-form">'
    + '      <input id="cw-text" type="text" autocomplete="off" placeholder="Type a message…"/>'
    + '      <button class="cw-send" id="cw-send" type="submit">Send</button>'
    + '    </form>'
    + '  </div>'
    + '</div>';

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

function addUser(mount, text) {
  var row = document.createElement('div');
  row.className = 'cw-row user';
  row.innerHTML = '<div class="cw-bubble">' + escapeHtml(text) + '</div>';
  mount.appendChild(row);
  scrollToEnd(mount);
}

/* ===================== Helpers ===================== */

function loadConfig() {
  return safeFetch('/chat-widget/assets/chat/config.json', { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error("config.json " + res.status);
      return res.json();
    })
    .catch(function () {
      // fallback defaults
      return {
        workerUrl: '/chat',
        title: 'Chat',
        greeting: '',
        accent: '#4f46e5',
        radius: '14px',
        model: 'llama-3.1-8b-instant',
        temperature: 0.2,
        systemUrl: ''
      };
    });
}

function applyTheme(cfg) {
  cfg = cfg || {};
  var accent = (cfg.brand && cfg.brand.accent) || cfg.accent || '#4f46e5';
  var radius = (cfg.brand && cfg.brand.radius) || cfg.radius || '14px';
  var root = document.documentElement;
  root.style.setProperty('--chat-accent', accent);
  root.style.setProperty('--chat-radius', radius);
}

function addError(noteEl, msg) {
  noteEl.textContent = msg;
  setTimeout(function () { noteEl.textContent = ''; }, 6000);
}

function showTyping(mount) {
  var row = document.createElement('div');
  row.className = 'cw-row bot';
  row.innerHTML = ''
    + '<div class="cw-bubble">'
    + '  <span class="cw-typing">'
    + '    <span class="cw-dot"></span><span class="cw-dot"></span><span class="cw-dot"></span>'
    + '  </span>'
    + '</div>';
  mount.appendChild(row);
  scrollToEnd(mount);
  return function () { row.remove(); };
}

function scrollToEnd(el) { el.scrollTop = el.scrollHeight; }

function escapeHtml(s) {
  s = s || '';
  return s.replace(/[&<>"']/g, function (m) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
  });
}

function fetchSystem(url) {
  if (!url) return Promise.resolve('');
  return safeFetch(url, { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.text() : ''; })
    .then(function (txt) {
      txt = (txt || '').toString();
      if (txt.length > 12000) txt = txt.slice(0, 12000);
      return txt;
    })
    .catch(function () { return ''; });
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function safeFetch(url, options) {
  // Tries absolute path first; if it fails (e.g., GitHub Pages subpath), retries relative.
  return fetch(url, options).catch(function () {
    try {
      if (url && typeof url === 'string' && url.charAt(0) === '/') {
        return fetch(url.replace(/^\//, ''), options);
      }
    } catch (e) {}
    throw new Error("fetch failed: " + url);
  });
}
