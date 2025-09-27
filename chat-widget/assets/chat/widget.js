// Chat Widget — /chat-widget/assets/chat/widget.js
// Vanilla JS floating chat that talks to your Cloudflare Worker.
// Conversational formatter (intro + bullets) with optional "Show more" toggle.
// Also includes a local “topics” view.

/* ===================== Config & State ===================== */

const TONY_TOPICS = [
  { title: "Real-world case studies", body: "Examples of dashboards, workforce models, and AI copilots I’ve built — and how they were used to make decisions." },
  { title: "Behind the scenes", body: "How I clean, structure, and shape messy datasets so they tell a clear story." },
  { title: "Career pivots", body: "What I learned moving from HR into analytics, and advice for making that shift." },
  { title: "The human side of data", body: "Blending analytics with emotional intelligence and storytelling so insights resonate." },
  { title: "Tools and workflows", body: "How I use Tableau, SQL, Python, and AI copilots day-to-day, and when I reach for each." },
  { title: "Future outlook", body: "Where AI is reshaping HR, workforce analytics, and decision-making — opportunities and challenges." }
];

var TONY_AVATAR_URL = "/assets/chat/tony-avatar.jpg"; // change if needed
var HISTORY = []; // {role:'user'|'assistant'|'system', content:'...'}

/* Toggle behavior: how much to show before offering "Show more" */
var FORMAT_LIMITS = {
  list: Infinity,       // show all bullets by default
  sentences: Infinity,  // show all sentences by default
  moreThresholdChars: 1400 // if formatted HTML > this, show a "Show more/less" toggle
};

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
              history: HISTORY.slice(-12)
            })
          })
          .then(function (res) {
            return res.ok
              ? res.json().catch(function(){ return {}; })
              : res.text().then(function (txt) { throw new Error("HTTP " + res.status + ": " + txt); });
          })
          .then(function (data) {
            var raw = data && (data.text || data.reply || data.message);
            if (!raw) return addError(ui.note, "Error: invalid response");

            var fmt = formatAssistant(raw);     // returns {html, fullHtml, truncated}
            addAssistantFormatted(ui.scroll, fmt);
            HISTORY.push({ role: "assistant", content: stripHtml(fmt.fullHtml || fmt.html) });
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
  } catch (err) {
    console.error("[widget] boot error:", err);
  }
})();

/* ===================== Conversational Formatter ===================== */
/*
  Strategy (XSS-safe):
    1) Escape ALL model text.
    2) Convert markdown bold **text** -> <strong>text</strong>.
    3) If there are list lines (- or *), render as <ul><li>…</li></ul> (no cap).
    4) Else, convert "Label: details" into "<strong>Label</strong> — details" (no cap).
    5) Else, split into paragraphs (no cap).
  If formatted HTML is very long, we generate a shortened version + a "Show more/less" toggle.
*/

function formatAssistant(text) {
  var t = (text || "").trim();

  // Normalize whitespace and bullets
  t = t.replace(/\r\n/g, "\n")
       .replace(/\t/g, " ")
       .replace(/\u2022/g, "- ")      // • -> -
       .replace(/\s{2,}/g, " ")
       .replace(/\n{3,}/g, "\n\n");

  // Escape EVERYTHING first (so raw HTML from model can't run)
  var escaped = escapeHtml(t);

  // Convert markdown bold **text** into <strong>text</strong>
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  var htmlFull = "";
  var htmlShort = "";

  // Path A: model already produced bullets
  if (/^[-*]\s+/m.test(escaped)) {
    var lines = escaped.split("\n").map(function (l) { return l.trim(); });
    var intro = [];
    var items = [];
    var inList = false;

    lines.forEach(function (l) {
      if (/^[-*]\s+/.test(l)) { inList = true; items.push(l.replace(/^[-*]\s+/, "")); }
      else if (!inList) { intro.push(l); }
      else if (l) { items[items.length - 1] += " " + l; }
    });

    var introHtml = collapse(intro.join(" ").trim());

    var listHtmlAll = items.map(function (it) {
     it = collapse(it);
     it = stripLeadIn(it);
     it = labelizeHTML(it); // adds <strong>Label</strong> — rest
      return "<li>" + it + "</li>";
    }).join("");

    htmlFull = (introHtml ? "<p>" + introHtml + "</p>" : "") + "<ul>" + listHtmlAll + "</ul>";

    var listLimit = FORMAT_LIMITS.list;
    if (isFinite(listLimit) && items.length > listLimit) {
      var listHtmlShort = items.slice(0, listLimit).map(function (it) {
        it = collapse(it);
        it = labelizeHTML(it);
        return "<li>" + it + "</li>";
      }).join("");
      htmlShort = (introHtml ? "<p>" + introHtml + "</p>" : "") + "<ul>" + listHtmlShort + "</ul>";
    }
  }
  else {
    // Path B: synthesize bullets from "Label: details"
    var parts = escaped.split(/[.;]\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var labeled = parts.filter(function (s) { return /:/.test(s) && /^[A-Z][A-Za-z0-9 ()/-]{2,60}:\s/.test(s); });

    if (labeled.length >= 2) {
      var head = collapse(escaped.split(":")[0]);
      if (head.length > 160) head = "Here are a few highlights:";

      var bulletsAll = labeled.map(function (s) {
        s = s.replace(/\.$/, "");
        s = collapse(s);
        s = stripLeadIn(s);
      return "<li>" + labelizeHTML(s) + "</li>";
      }).join("");

      htmlFull = "<p>" + head + "</p><ul>" + bulletsAll + "</ul>";

      var listLimitB = FORMAT_LIMITS.list;
      if (isFinite(listLimitB) && labeled.length > listLimitB) {
        var bulletsShort = labeled.slice(0, listLimitB).map(function (s) {
          s = s.replace(/\.$/, "");
          s = collapse(s);
          return "<li>" + labelizeHTML(s) + "</li>";
        }).join("");
        htmlShort = "<p>" + head + "</p><ul>" + bulletsShort + "</ul>";
      }
    } else {
      // Path C: plain paragraphs
      var sentencesAll = escaped.split(/(?<=\.)\s+/).map(collapse).filter(Boolean);
      htmlFull = sentencesAll.map(function (s) { return "<p>" + s + "</p>"; }).join("");

      var sentLimit = FORMAT_LIMITS.sentences;
      if (isFinite(sentLimit) && sentencesAll.length > sentLimit) {
        var sentencesShort = sentencesAll.slice(0, sentLimit);
        htmlShort = sentencesShort.map(function (s) { return "<p>" + s + "</p>"; }).join("");
      }
    }
  }

  // Decide whether we need a toggle
  var needsToggle = false;
  var shortHtml = htmlFull;
  if (htmlFull.length > FORMAT_LIMITS.moreThresholdChars && htmlShort) {
    needsToggle = true;
    shortHtml = htmlShort;
  }

  return { html: shortHtml, fullHtml: htmlFull, truncated: needsToggle };
}

// expects already-escaped input, returns HTML with <strong> label
function labelizeHTML(s) {
  var m = s.match(/^([^:]{2,80}):\s*(.+)$/);
  if (!m) return s;
  var label = m[1].trim();
  var rest  = m[2].trim();
  return "<strong>" + label + "</strong> — " + rest;
}

function collapse(s) { return (s || "").replace(/\s{2,}/g, " ").trim(); }

function stripHtml(html) {
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

/* ===================== Render helpers ===================== */

function addAssistantFormatted(mount, fmt) {
  var row = document.createElement('div');
  row.className = 'cw-row bot';

  var bubble = document.createElement('div');
  bubble.className = 'cw-bubble';
  bubble.innerHTML = fmt.html;

  // Toggle
  if (fmt.truncated) {
    var toggle = document.createElement('button');
    toggle.type = "button";
    toggle.textContent = "Show more";
    toggle.style.display = "inline-block";
    toggle.style.marginTop = "6px";
    toggle.style.fontSize = "12px";
    toggle.style.border = "none";
    toggle.style.background = "transparent";
    toggle.style.color = "var(--chat-muted)";
    toggle.style.cursor = "pointer";
    toggle.addEventListener('click', function () {
      var expanded = toggle.getAttribute('data-expanded') === '1';
      if (expanded) {
        bubble.innerHTML = fmt.html;
        toggle.textContent = "Show more";
        toggle.setAttribute('data-expanded', '0');
      } else {
        bubble.innerHTML = fmt.fullHtml;
        toggle.textContent = "Show less";
        toggle.setAttribute('data-expanded', '1');
      }
      scrollToEnd(mount);
    });
    bubble.appendChild(document.createElement('br'));
    bubble.appendChild(toggle);
  }

  row.appendChild(bubble);
  mount.appendChild(row);
  scrollToEnd(mount);
}

function stripLeadIn(s) {
  // remove filler like "Some highlights include —", "Highlights include:", etc.
  return (s || "").replace(/^(?:some\s+)?highlights?\s+include(?:s)?\s*[—\-:]\s*/i, "");
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

function addUser(mount, text) {
  var row = document.createElement('div');
  row.className = 'cw-row user';
  row.innerHTML = '<div class="cw-bubble">' + escapeHtml(text) + '</div>';
  mount.appendChild(row);
  scrollToEnd(mount);
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

/* ===================== DOM + Shell ===================== */

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

/* ===================== Utilities ===================== */

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
  // Try absolute; if it fails (GH Pages subpath), retry relative.
  return fetch(url, options).catch(function () {
    try {
      if (url && typeof url === 'string' && url.charAt(0) === '/') {
        return fetch(url.replace(/^\//, ''), options);
      }
    } catch (e) {}
    throw new Error("fetch failed: " + url);
  });
}
