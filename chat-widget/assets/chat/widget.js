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

var TONY_AVATAR_URL = "/assets/img/profile-img.jpg";
var HISTORY = [];
var __TONY_PERSONA__ = {};
var __TONY_SOURCES__ = [];

/* ===================== Boot ===================== */

(function boot() {
  try {
    var mount = ensureMount();
    loadConfig().then(function (cfg) {
      applyTheme(cfg);
      fetchSystem(cfg.systemUrl).then(function (system) {
        Promise.all([
          fetchJSON('/chat-widget/assets/chat/persona.json').catch(function(){ return {}; }),
          fetchJSON('/chat-widget/assets/chat/sources.json').catch(function(){ return {}; })
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
                autoSizeTextArea(ui.input, 52, 120, true);   // adjusted
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
                autoSizeTextArea(ui.input, 52, 120, true);   // adjusted

                // Local /topics shortcut
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
                    context: {
                      persona: __TONY_PERSONA__,
                      sources: __TONY_SOURCES__,
                      creative_mode: true
                    }
                  })
                })
                .then(function (res) {
                  if (res.ok) return res.json().catch(function(){ return {}; });
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
                  addError(ui.note, "Network error: " + String((err && err.message) || err));
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

              // resize as user types
              ui.input.addEventListener('input', function () {
                autoSizeTextArea(ui.input, 52, 120);         // adjusted
              });
            });
        });
      });
    });
  } catch (err) {
    console.error("[widget] boot error:", err);
  }
})();

/* ===================== Auto-size helper ===================== */

function autoSizeTextArea(el, min, max, reset) {
  if (!el) return;
  if (reset) el.style.height = min + "px";
  el.style.overflowY = "hidden";
  el.style.height = min + "px";
  el.style.height = Math.min(el.scrollHeight, max) + "px";
  el.style.overflowY = (el.scrollHeight > max) ? "auto" : "hidden";
}

/* ===================== Derive sources from persona.links ===================== */

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

/* ===================== Retrieval helpers ===================== */

function fetchJSON(url) {
  return safeFetch(url, { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .catch(function () { return {}; });
}

function loadSources(sourcesList, maxBytesPerSource) {
  var list = Array.isArray(sourcesList) ? sourcesList : [];
  if (!list.length) return Promise.resolve([]);

  var tasks = list.map(function (item) {
    var url = item && item.url;
    if (!url) return Promise.resolve(null);

    return fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error("Fetch fail " + r.status);
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html'))      return r.text().then(htmlToText);
        if (ct.includes('text/plain') || ct.includes('text/markdown')) return r.text();
        return "";
      })
      .then(function (txt) {
        txt = (txt || "").replace(/\s{2,}/g, " ").trim();
        if (!txt) return null;
        var cap = maxBytesPerSource || 12000;
        if (txt.length > cap) txt = txt.slice(0, cap);
        var chunks = chunkText(txt, 1200, 200);
        return { title: item.title || url, url: url, chunks: chunks };
      })
      .catch(function () { return null; });
  });

  return Promise.all(tasks).then(function (arr) { return arr.filter(Boolean); });
}

function htmlToText(html) {
  try {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    ['script','style','noscript','template','iframe'].forEach(function(sel){
      doc.querySelectorAll(sel).forEach(function(n){ n.remove(); });
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
  if (!s) return out;
  while (i < n) {
    var end = Math.min(i + size, n);
    out.push(s.slice(i, end));
    if (end === n) break;
    i = end - ov;
    if (i < 0) i = 0;
  }
  return out;
}

/* ===================== Conversational Formatter ===================== */

// (all your existing formatAssistant, labelizeHTML, etc. stay unchanged)

/* ===================== DOM + UI ===================== */

// (all your existing ensureMount, buildShell, addAssistant, etc. stay unchanged)
