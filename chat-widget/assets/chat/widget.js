// Chat Widget — /chat-widget/assets/chat/widget.js
// Vanilla JS floating chat that talks to your Cloudflare Worker.
// Conversational formatter (intro + bullets/numbered) with a local “topics” view.
// - Safer config loading (absolute + relative retry)
// - Robust response parsing (supports text/reply/message/content/choices[0].message.content)
// - No double system prompt in HISTORY
// - Persona context included in POST body to improve accuracy
// - Avatar launcher + injected minimal CSS for Topics (tny-*) view

/* ===================== Config & State ===================== */

// Detect a base for assets so this works on a root domain or a subpath.
var __SCRIPT_BASE__ = (function () {
  // Try to infer from the last loaded script tag
  var scripts = document.getElementsByTagName('script');
  var me = scripts[scripts.length - 1];
  var src = (me && me.src) ? me.src : "";
  // If script is /chat-widget/assets/chat/widget.js, base is /chat-widget/
  var m = src.match(/^(.*\/chat-widget\/)assets\/chat\/widget\.js(\?.*)?$/);
  if (m) return m[1];
  // Fallback: try to find /chat-widget/ in current path
  if (location.pathname.indexOf('/chat-widget/') !== -1) {
    return location.pathname.split('/chat-widget/')[0] + '/chat-widget/';
  }
  // As a last resort, assume root
  return '/chat-widget/';
})();

function assetUrl(p) {
  // Normalize "assets/..." or "/chat-widget/assets/..." to a usable path
  if (!p) return p;
  if (p.startsWith('http')) return p;
  if (p.startsWith('/')) return p; // absolute works on custom domains
  // relative inside /chat-widget/
  return __SCRIPT_BASE__ + p.replace(/^\.?\//, '');
}

const TONY_TOPICS = [
  { title: "Real-world case studies", body: "Examples of dashboards, workforce models, and AI copilots I’ve built — and how they were used to make decisions." },
  { title: "Behind the scenes", body: "How I clean, structure, and shape messy datasets so they tell a clear story." },
  { title: "Career pivots", body: "What I learned moving from HR into analytics, and advice for making that shift." },
  { title: "The human side of data", body: "Blending analytics with emotional intelligence and storytelling so insights resonate." },
  { title: "Tools and workflows", body: "How I use Tableau, SQL, Python, and AI copilots day-to-day, and when I reach for each." },
  { title: "Future outlook", body: "Where AI is reshaping HR, workforce analytics, and decision-making — opportunities and challenges." }
];

var TONY_AVATAR_URL = assetUrl('assets/img/profile-img.jpg'); // base-aware
var HISTORY = []; // only user/assistant turns; system sent separately
var __TONY_PERSONA__ = {}; // loaded below

/* ===================== Boot ===================== */

(function boot() {
  try {
    var mount = ensureMount();
    loadConfig().then(function (cfg) {
      applyTheme(cfg);

      fetchSystem(cfg.systemUrl).then(function (system) {
        // DO NOT push system into HISTORY to avoid double-application server-side.

        // Load persona JSON for accurate examples
        fetchJSON(assetUrl('assets/chat/persona.json')).then(function (persona) {
          __TONY_PERSONA__ = persona || {};

          var ui = buildShell(cfg, mount);

          // === Avatar launcher (Tony’s face + tiny bubble) ===
          ui.launcher.classList.add('cw-launcher--avatar');
          ui.launcher.innerHTML = `
            <div class="cw-avatar-wrapper" aria-label="Open chat with Tony">
              <img src="${TONY_AVATAR_URL}" alt="Tony" class="cw-avatar-img" />
              <div class="cw-avatar-bubble" title="Chat">💬</div>
            </div>
          `;

          // Inject minimal styles for launcher + Topics (tny-*)
          (function injectStyles () {
            if (document.querySelector('style[data-cw-avatar-styles]')) return;
            var css = `
              .cw-launcher--avatar{width:auto;height:auto;padding:0;border:0;background:transparent;box-shadow:none;border-radius:999px}
              .cw-avatar-wrapper{position:relative;display:inline-block;cursor:pointer;line-height:0}
              .cw-avatar-img{width:64px;height:64px;border-radius:999px;object-fit:cover;box-shadow:0 6px 16px rgba(0,0,0,.25);display:block}
              .cw-avatar-bubble{position:absolute;right:-6px;top:-6px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#3e5494;color:#fff;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,.2);transform:translateZ(0)}
              .cw-hidden.cw-launcher--avatar{display:none!important}
              /* Topics microview */
              .tny-section-sep{height:1px;background:#eee;margin:12px 0}
              .tny-chat{margin:12px 0}
              .tny-row{display:flex;gap:10px;margin:10px 0;align-items:flex-start}
              .tny-row--tony .tny-avatar{width:32px;height:32px;border-radius:999px;background-size:cover;background-position:center;flex:0 0 auto}
              .tny-bubble{background:#f7f7fb;border:1px solid #e5e7eb;padding:10px 12px;border-radius:12px;max-width:640px}
              .tny-content h4{margin:0 0 4px 0;font-size:14px}
              .tny-content p{margin:0;font-size:13px;line-height:1.4}
            `;
            var s = document.createElement('style');
            s.setAttribute('data-cw-avatar-styles', 'true');
            s.textContent = css;
            document.head.appendChild(s);
          })();

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

            // Local topics intercept
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
                model: cfg.model,
                temperature: cfg.temperature,
                history: HISTORY.slice(-12),
                context: { persona: __TONY_PERSONA__ }
              })
            })
            .then(function (res) {
              if (res.ok) {
                return res.json().catch(function(){ return {}; });
              }
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

          // Enter to send, Shift+Enter newline
          ui.input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ui.form.dispatchEvent(new Event('submit'));
            }
          });
        });
      });
    });
  } catch (err) {
    console.error("[widget] boot error:", err);
  }
})();

/* ===================== Conversational Formatter ===================== */
/*
  Strategy (XSS-safe):
    1) Escape ALL model text.
    2) Convert markdown bold/code/links.
    3) If there are list lines (-, *, or 1.), render as <ul>/<ol>.
    4) Else, convert "Label: details" lines into bullets with <strong>Label</strong> — details.
    5) Else, split into short paragraphs (no lookbehind).
*/

function formatAssistant(text) {
  var t = (text || "").trim();

  // Normalize whitespace and bullets
  t = t.replace(/\r\n/g, "\n")
       .replace(/\t/g, " ")
       .replace(/\u2022/g, "- ")
       .replace(/\s{2,}/g, " ")
       .replace(/\n{3,}/g, "\n\n");

  // Escape EVERYTHING first (so raw HTML from model can't run)
  t = escapeHtml(t);

  // Light Markdown touches after escaping:
  // **bold**
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // `inline code`
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  // [text](http...)
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Split into lines for list detection
  var lines = t.split("\n").map(function (s) { return s.trim(); });

  // Path A: If list items (bulleted or numbered), render intro + list
  var hasBullets = lines.some(function (l) { return /^[-*]\s+/.test(l); });
  var hasNumbers = lines.some(function (l) { return /^\d+\.\s+/.test(l); });

  if (hasBullets || hasNumbers) {
    // Collect intro (non-list lines until first list item)
    var intro = [];
    var firstListIdx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (/^([-*]|\d+\.)\s+/.test(lines[i])) { firstListIdx = i; break; }
      if (lines[i]) intro.push(lines[i]);
    }
    var introText = normalizeIntro(collapse(intro.join(" ")));

    // Build items (max 5)
    var itemLines = (firstListIdx >= 0 ? lines.slice(firstListIdx) : [])
      .filter(function (l) { return /^([-*]|\d+\.)\s+/.test(l); })
      .slice(0, 5);

    var items = itemLines.map(function (l) {
      var body = l.replace(/^([-*]|\d+\.)\s+/, "");
      body = labelizeHTML(collapse(body));
      if (introText) {
        var titleRE = new RegExp("^" + introText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[—:-]\\s*", "i");
        body = body.replace(titleRE, "");
      }
      body = body.replace(/^<strong>Some highlights include<\/strong>\s*[—:-]\s*/i, "");
      return "<li>" + body + "</li>";
    }).join("");

    var introHtml = introText ? "<p>" + introText + "</p>" : "";
    var listTag = hasNumbers ? "ol" : "ul";
    return introHtml + "<" + listTag + ">" + items + "</" + listTag + ">";
  }

  // Path B: Labeled lines (“Thing: detail”) -> intro + bullets
  var labeled = lines.filter(function (s) {
    return /:/.test(s) && /^[A-Z][A-Za-z0-9 ()/-]{2,60}:\s/.test(s);
  });

  if (labeled.length >= 1) {
    // Intro = first non-labeled, non-bullet chunk
    var introLines = [];
    for (var k = 0; k < lines.length; k++) {
      var L = lines[k];
      if (/^([-*]|\d+\.)\s+/.test(L)) break;
      if (/:/.test(L)) break;
      if (L) introLines.push(L);
    }
    var introText2 = normalizeIntro(collapse(introLines.join(" ")));

    var bullets = labeled.slice(0, 4).map(function (s) {
      var lbl  = s.split(":")[0].trim();
      var body = s.split(":").slice(1).join(":").trim().replace(/\.$/, "");
      if (introText2 && lbl.toLowerCase() === introText2.toLowerCase()) {
        return "<li>" + collapse(body) + "</li>";
      }
      return "<li><strong>" + lbl + "</strong> — " + collapse(body) + "</li>";
    }).join("");

    var title = introText2 || "Here are a few highlights:";
    title = title.replace(/^Some highlights include\s*[—:-]?\s*/i, "");
    return "<p>" + title + "</p><ul>" + bullets + "</ul>";
  }

  // Path C: fallback — short paragraphs (max 3) (no lookbehind)
  var sentences = t
    .split(/(?:\.\s+|\n{2,})/)   // split on period+space OR blank lines
    .map(collapse)
    .filter(Boolean)
    .slice(0, 3);

  return sentences.map(function (s) { return "<p>" + s + "</p>"; }).join("");
}

// Remove boilerplate openers that cause echoes
function normalizeIntro(s) {
  s = collapse(s || "");
  if (!s) return s;
  s = s.replace(/^Some highlights include\s*[—:-]?\s*/i, "");
  s = s.replace(/^Here (are|'re) (a few )?highlights\s*[—:-]?\s*/i, "");
  s = s.replace(/^Highlights\s*[—:-]?\s*/i, "");
  if (s.length > 160) {
    var sents = s.split(/(?:\.\s+|\n{2,})/).slice(0, 2).join(". ");
    s = s || s.slice(0, 160);
  }
  return s;
}

// Safe helper: expects already-escaped input, returns HTML with <strong> label
function labelizeHTML(s) {
  // Normalize grammar so headings always parse as "Label: detail"
  s = s.replace(/^(.{2,80}?)\s+I built\b/i, "$1: I built");
  // If model used dash instead of colon, normalize too:
  s = s.replace(/^(.{2,80}?)\s*[—-]\s+/i, "$1: ");
  // Standard "Label: detail" splitter
  var m = s.match(/^([^:]{2,80}):\s*(.+)$/);
  if (!m) return s;
  var label = m[1].trim();
  var rest  = m[2].trim();
  // Tidy
  rest = rest.replace(/^[—:-]\s*/, "").replace(/\s{2,}/g, " ").replace(/\s+\.$/, ".");
  return "<strong>" + label + "</strong> — " + rest;
}

function collapse(s) { return (s || "").replace(/\s{2,}/g, " ").trim(); }

function stripHtml(html) {
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

/* ===================== Topics View ===================== */

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
  bubble.textContent = text; // plain greeting etc.
  row.appendChild(bubble);
  mount.appendChild(row);
  scrollToEnd(mount);
}

function addAssistantHTML(mount, html) {
  var row = document.createElement('div');
  row.className = 'cw-row bot';
  var bubble = document.createElement('div');
  bubble.className = 'cw-bubble';
  bubble.innerHTML = html; // formatted output
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

function fetchJSON(url) {
  return safeFetch(url, { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .catch(function () { return {}; });
}

function loadConfig() {
  var primary = '/chat-widget/assets/chat/config.json';
  var relative = 'chat-widget/assets/chat/config.json';
  return fetch(primary, { cache: 'no-store' })
    .then(function (res) {
      if (res.ok) return res.json();
      // Retry relative if absolute path 404s (subpath-safe)
      return fetch(relative, { cache: 'no-store' }).then(function (res2) {
        if (res2.ok) return res2.json();
        throw new Error("config.json " + res.status + " & " + res2.status);
      });
    })
    .catch(function () {
      // Fallback defaults (edit workerUrl if your route differs)
      return {
        workerUrl: '/chat',
        title: 'Chat',
        greeting: '',
        brand: { accent: '#3e5494', radius: '14px' },
        model: 'llama-3.1-8b-instant',
        temperature: 0.2,
        systemUrl: '/chat-widget/assets/chat/system.md'
      };
    });
}

function applyTheme(cfg) {
  cfg = cfg || {};
  var accent = (cfg.brand && cfg.brand.accent) || cfg.accent || '#3e5494';
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
  // Try absolute; if it fails at networking level, retry relative.
  return fetch(url, options).catch(function () {
    try {
      if (url && typeof url === 'string' && url.charAt(0) === '/') {
        return fetch(url.replace(/^\//, ''), options);
      }
    } catch (e) {}
    throw new Error("fetch failed: " + url);
  });
}
