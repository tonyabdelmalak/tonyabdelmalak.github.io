// Chat Widget — /chat-widget/assets/chat/widget.js
// Vanilla JS floating chat that talks to your Cloudflare Worker.
// Consistent formatting + optional persona/sources context (RAG-lite).

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
                autoSizeTextArea(ui.input, 52, 120, true);
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
                autoSizeTextArea(ui.input, 52, 120, true);
                ui.input.focus();

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

              // Auto-expand textarea as user types
              ui.input.addEventListener('input', function () {
                autoSizeTextArea(ui.input, 52, 120);
              });
            });
        });
      });
    });
  } catch (err) {
    console.error("[widget] boot error:", err);
  }
})();

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
/*
  - Follow-up handling
  - Bullet/label normalization
*/
function formatAssistant(text) {
  var t = (text || "").trim();
  t = t.replace(/\r\n/g, "\n").replace(/\t/g, " ");
  t = t.replace(/(?:\s+|\s*[-–—]\s*)Follow-?\s?up\s*[:–—-]\s*/gi, "\n- Follow-up: ");

  t = t.replace(/\u2022/g, "- ")
       .replace(/^\*\s+/gm, "- ")
       .replace(/^\s*[-*]\s+([A-Z].+?:)/gm, "- $1")
       .replace(/\n{3,}/g, "\n\n");

  t = t.replace(/^- -\s+/gm, "- ");
  t = t.replace(/^Some highlights include\s*[—:-]?\s*/gim, "Here are a few highlights:\n");

  t = escapeHtml(t);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
                '<a href="$2" target="_blank" rel="noopener">$1</a>');

  var lines = t.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  var hasBullets = lines.some(function (l) { return /^[-*]\s+/.test(l); });
  var hasNumbers = lines.some(function (l) { return /^\d+\.\s+/.test(l); });

  if (hasBullets || hasNumbers) {
    var intro = [], firstListIdx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (/^([-*]|\d+\.)\s+/.test(lines[i])) { firstListIdx = i; break; }
      intro.push(lines[i]);
    }
    var introText = normalizeIntro(collapse(intro.join(" ")));

    var rawItems = (firstListIdx >= 0 ? lines.slice(firstListIdx) : [])
      .filter(function (l) { return /^([-*]|\d+\.)\s+/.test(l); })
      .slice(0, 10);

    var seen = new Set();
    var items = rawItems.map(function (l) {
      var body = l.replace(/^([-*]|\d+\.)\s+/, "");
      body = labelizeHTML(collapse(body));
      if (introText) {
        var titleRE = new RegExp("^" + introText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[—:-]\\s*", "i");
        body = body.replace(titleRE, "");
      }
      body = body.replace(/^<strong>Some highlights include<\/strong>\s*[—:-]\s*/i, "");
      var key = body.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return "<li>" + body + "</li>";
    }).filter(Boolean).join("");

    var introHtml = introText ? "<p>" + introText + "</p>" : "";
    var listTag = hasNumbers ? "ol" : "ul";
    return introHtml + "<" + listTag + ">" + items + "</" + listTag + ">";
  }

  var labeled = lines.filter(function (s) {
    return /:/.test(s) && /^[A-Z][A-Za-z0-9 ()/-]{2,60}:\s/.test(s);
  });

  if (labeled.length >= 1) {
    var introLines = [];
    for (var k = 0; k < lines.length; k++) {
      var L = lines[k];
      if (/^([-*]|\d+\.)\s+/.test(L)) break;
      if (/:/.test(L)) break;
      introLines.push(L);
    }
    var introText2 = normalizeIntro(collapse(introLines.join(" ")));

    var seen2 = new Set();
    var bullets = labeled.slice(0, 8).map(function (s) {
      var idx = s.indexOf(":");
      var lbl  = s.slice(0, idx).trim();
      var body = s.slice(idx + 1).trim().replace(/\.$/, "");
      var itemHtml = (lbl.toLowerCase() === "follow-up")
        ? "<strong>Follow-up:</strong> " + collapse(body)
        : "<strong>" + lbl + "</strong> — " + collapse(body);
      var key = itemHtml.toLowerCase();
      if (seen2.has(key)) return null;
      seen2.add(key);
      return "<li>" + itemHtml + "</li>";
    }).filter(Boolean).join("");

    var title = introText2 || "Here are a few highlights:";
    title = title.replace(/^Some highlights include\s*[—:-]?\s*/i, "");
    return "<p>" + title + "</p><ul>" + bullets + "</ul>";
  }

  var sentences = t.split(/(?:\.\s+|\n{2,})/).map(collapse).filter(Boolean).slice(0, 3);
  return sentences.map(function (s) { return "<p>" + s + "</p>"; }).join("");
}

function normalizeIntro(s) {
  s = collapse(s || "");
  if (!s) return s;
  s = s.replace(/^Some highlights include\s*[—:-]?\s*/i, "");
  s = s.replace(/^Here (are|'re) (a few )?highlights\s*[—:-]?\s*/i, "Here are a few highlights:");
  s = s.replace(/^Highlights\s*[—:-]?\s*/i, "Here are a few highlights:");
  if (s.length > 160) {
    var sents = s.split(/(?:\.\s+|\n{2,})/).slice(0, 2).join(". ");
    s = sents || s.slice(0, 160);
  }
  return s;
}

function labelizeHTML(s) {
  if (/^follow-?\s?up\s*[:]/i.test(s)) {
    return "<strong>Follow-up:</strong> " + collapse(s.replace(/^follow-?\s?up\s*[:]\s*/i, ""));
  }
  s = s.replace(/^(.{2,80}?)\s+I built\b/i, "$1: I built");
  s = s.replace(/^(.{2,80}?)\s*[—-]\s+/i, "$1: ");
  var m = s.match(/^([^:]{2,80}):\s*(.+)$/);
  if (!m) return s;
  var label = m[1].trim();
  var rest  = m[2].trim().replace(/^[—:-]\s*/, "").replace(/\s{2,}/g, " ").replace(/\s+\.$/, ".");
  return "<strong>" + label + "</strong> — " + rest;
}

function collapse(s) { return (s || "").replace(/\s{2,}/g, " ").trim(); }

function stripHtml(html) {
  try {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    ["script","style","noscript","template","iframe"].forEach(function(sel){
      doc.querySelectorAll(sel).forEach(function(n){ n.remove(); });
    });
    return (doc.body.textContent || "").replace(/\s{2,}/g, " ").trim();
  } catch (e) {
    var tmp = document.createElement("div");
    tmp.innerHTML = String(html || "");
    return (tmp.textContent || tmp.innerText || "").replace(/\s{2,}/g
