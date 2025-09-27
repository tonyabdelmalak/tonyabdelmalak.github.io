// Chat Widget — /chat-widget/assets/chat/widget.js
// Vanilla JS chat + conversational formatter for assistant replies.
// Also renders a local "topics" view when asked.

const TONY_TOPICS = [
  { title: "Real-world case studies", body: "Examples of dashboards, workforce models, and AI copilots I’ve built — and how they were used to make decisions." },
  { title: "Behind the scenes", body: "How I clean, structure, and shape messy datasets so they tell a clear story." },
  { title: "Career pivots", body: "What I learned moving from HR into analytics, and advice for making that shift." },
  { title: "The human side of data", body: "Blending analytics with emotional intelligence and storytelling so insights resonate." },
  { title: "Tools and workflows", body: "How I use Tableau, SQL, Python, and AI copilots day-to-day, and when I reach for each." },
  { title: "Future outlook", body: "Where AI is reshaping HR, workforce analytics, and decision-making — opportunities and challenges." }
];

var TONY_AVATAR_URL = "/assets/chat/tony-avatar.jpg";
var HISTORY = []; // {role, content}

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

        ui.launcher.addEventListener('click', function () {
          ui.panel.style.display = 'block';
          ui.launcher.classList.add('cw-hidden');
          ui.input.focus();
        });
        ui.closeBtn.addEventListener('click', function () {
          ui.panel.style.display = 'none';
          ui.launcher.classList.remove('cw-hidden');
        });

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
              HISTORY.push({ role: "assistant", content: "Here are topics I’m happy to cover." });
              scrollToEnd(ui.scroll);
            });
            return;
          }

          var stopTyping = showTyping(ui.scroll);
          ui.send.disabled = true;

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
          })
          .then(function (res) {
            return res.ok ? res.json().catch(function(){ return {}; })
                          : res.text().then(function(txt){ throw new Error("HTTP " + res.status + ": " + txt); });
          })
          .then(function (data) {
            var raw = data && (data.text || data.reply || data.message);
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
  } catch (err) {
    console.error("[widget] boot error:", err);
  }
})();

/* ===================== Conversational Formatter ===================== */
/*
  Goals:
   - Turn long, dense paragraphs into: short intro + 2–4 bullets
   - Respect simple markdown (**bold**, -, •)
   - Convert "Title: details." patterns into strong labels
*/

function formatAssistant(text) {
  text = (text || "").trim();

  // Normalize whitespace and bullets
  text = text.replace(/\r\n/g, "\n")
             .replace(/\t/g, " ")
             .replace(/\u2022/g, "- ")          // • -> -
             .replace(/\s{2,}/g, " ")
             .replace(/\n{3,}/g, "\n\n");

  // If the model already gave list items, render them as <ul>
  var hasListLines = /^[-*]\s+/m.test(text);
  if (hasListLines) {
    var lines = text.split("\n").map(function (l) { return l.trim(); });
    var intro = [];
    var items = [];
    var inList = false;

    lines.forEach(function (l) {
      if (/^[-*]\s+/.test(l)) { inList = true; items.push(l.replace(/^[-*]\s+/, "")); }
      else if (!inList) { intro.push(l); }
      else if (l) { items[items.length - 1] += " " + l; }
    });

    var introHtml = intro.join(" ").trim();
    introHtml = escapeHtml(introHtml)
                .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    var listHtml = items.slice(0, 5).map(function (it) {
      it = collapse(it);
      it = labelize(it);
      it = escapeHtml(it).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      return "<li>" + it + "</li>";
    }).join("");

    return (introHtml ? "<p>" + introHtml + "</p>" : "") + "<ul>" + listHtml + "</ul>";
  }

  // Otherwise, try to extract “Label: details” bullets
  var candidates = text.split(/[.;]\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
  var labeled = candidates.filter(function (s) { return /:/.test(s) && /^[A-Z][A-Za-z0-9 ()/-]{2,40}:\s/.test(s); });

  if (labeled.length >= 2) {
    var head = text.split(":")[0];
    head = head.length > 160 ? "Here are a few highlights:" : head;
    var intro = escapeHtml(head).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    var bullets = labeled.slice(0, 4).map(function (s) {
      s = s.replace(/\.$/, "");
      s = labelize(s);
      s = collapse(s);
      s = escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      return "<li>" + s + "</li>";
    }).join("");

    return "<p>" + intro + "</p><ul>" + bullets + "</ul>";
  }

  // Fallback: sentence split into short paragraphs
  var sentences = text.split(/(?<=\.)\s+/).slice(0, 3).map(collapse);
  var html = sentences.map(function (s, i) {
    s = escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return "<p>" + s + "</p>";
  }).join("");
  return html;
}

// Turn "Title: details" into "<strong>Title</strong> — details"
function labelize(s) {
  var m = s.match(/^([^:]{2,80}):\s*(.+)$/);
  if (!m) return s;
  var label = m[1].trim();
  var rest  = m[2].trim();
  return "<strong>" + sanitizeInline(label) + "</strong> — " + sanitizeInline(rest);
}

function collapse(s) {
  return (s || "").replace(/\s{2,}/g, " ").trim();
}

function sanitizeInline(s) {
  // minimal cleanup; bold markup handled later
  return s.replace(/\*\*/g, "");
}

function stripHtml(html) {
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

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
  mount.innerHTML =
    '<button class="cw-launcher" id="cw-launch" aria-label="Open chat">' +
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3C7.03 3 3 6.58 3 11a7.6 7.6 0 0 0 2.1 5.1l-.7 3.2c-.1.5.36.95.85.83l3.7-.93A10.8 10.8 0 0 0 12 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" fill="currentColor"/></svg>' +
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
  bubble.textContent = text; // plain text (used for greetings etc.)
  row.appendChild(bubble);
  mount.appendChild(row);
  scrollToEnd(mount);
}

function addAssistantHTML(mount, html) {
  var row = document.createElement('div');
  row.className = 'cw-row bot';
  var bubble = document.createElement('div');
  bubble.className = 'cw-bubble';
  bubble.innerHTML = html; // formatted
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
  row.innerHTML =
    '<div class="cw-bubble"><span class="cw-typing"><span class="cw-dot"></span><span class="cw-dot"></span><span class="cw-dot"></span></span></div>';
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

function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

function safeFetch(url, options) {
  return fetch(url, options).catch(function () {
    try {
      if (url && typeof url === 'string' && url.charAt(0) === '/') {
        return fetch(url.replace(/^\//, ''), options);
      }
    } catch (e) {}
    throw new Error("fetch failed: " + url);
  });
}
