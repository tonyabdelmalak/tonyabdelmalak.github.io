// ============================================================================
// Tony Chat Widget — Updated to use system.md and about-tony.md only
// - Loads system and knowledge base markdown files for prompt
// - Removed persona.json to avoid duplicate persona instructions
// - Renders assistant replies with Markdown formatting (headings, lists, code, etc.)
// ============================================================================
(function() {
  "use strict";

  /* ------------------------ Defaults ------------------------ */
  var DEFAULTS = {
    workerUrl: "/chat",  // endpoint for the backend AI worker
    systemUrl: "/chat-widget/assets/chat/system.md",       // system prompt file (assistant behavior)
    kbUrl: "/chat-widget/assets/chat/about-tony.md",       // knowledge base file (Tony’s info)
    model: "llama-3.1-8b-instant",
    temperature: 0.275,
    title: "Hi, I'm Tony. What's on your mind?",    // Chat header title
    subtitle: "",
    brand: { accent: "#2f3a4f", radius: "18px" },
    greeting: "I'm happy to answer your questions about my background, specific projects/dashboards, or what I’m currently working towards.",
    persistHistory: false,
    maxHistory: 16,
    avatarUrl: "/assets/img/profile-img.jpg",
    enableHighlight: true   // enable code syntax highlighting if Prism is available
  };

  var CFG = null;
  var UI = {};
  var HISTORY = [];    // in-memory chat history for this session
  var OPEN = false;
  var BUSY = false;

  /* ------------------------ Utils ------------------------ */
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function assign() {
    var o = {};
    for (var i = 0; i < arguments.length; i++) {
      var s = arguments[i] || {};
      for (var k in s) o[k] = s[k];
    }
    return o;
  }
  function setVar(name, value) {
    document.documentElement.style.setProperty(name, value);
  }
  function scrollPane() {
    if (UI.pane) UI.pane.scrollTop = UI.pane.scrollHeight;
  }
  function growInput() {
    var el = UI.input;
    if (!el) return;
    el.style.height = "auto";
    var h = Math.min(el.scrollHeight, 140);
    el.style.height = h + "px";
  }
  function computeHeaderOffset() {
    // Adjust chat launcher position based on any site headers/navbars
    var el = document.querySelector('header.site-header') ||
             document.querySelector('header.header') ||
             document.querySelector('nav.navbar') ||
             document.querySelector('nav[role="navigation"]') ||
             document.querySelector('header') ||
             document.querySelector('nav');
    var h = el ? (el.offsetHeight || 64) : 64;
    document.documentElement.style.setProperty('--cw-top-offset', (h + 24) + 'px');
  }

  /* ------------------------ Markdown Rendering ------------------------ */
  // Minimal Markdown-to-HTML converter for chat messages
  function mdToHtml(input) {
    var s = String(input || "");
    s = s.replace(/\r\n/g, "\n");
    s = esc(s);

    // ```code blocks```
    s = s.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, function(_, lang, code) {
      var langClass = lang ? ' class="language-' + lang.toLowerCase() + '"' : "";
      // Preserve indentation & special chars in code
      var escapedCode = code.replace(/</g, "&lt;");
      return "<pre><code" + langClass + ">" + escapedCode + "</code></pre>";
    });

    // Inline `code`
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Headings (Markdown # to bold text for simplicity)
    s = s.replace(/^(#{1,6})\s*(.+)$/gm, function(_, hashes, text) {
      return "<strong>" + text.trim() + "</strong>";
    });

    // Bold **text** and italic *text*
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // Links [text](url)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Ordered lists (1. ... 2. ...)
    s = s.replace(/^(?:\d+\.)\s+.+(?:\n\d+\.\s+.+)*/gm, function(list) {
      var items = list.split("\n").map(function(line) {
        var m = line.match(/^\d+\.\s+(.+)$/);
        return m ? "<li>" + m[1] + "</li>" : "";
      }).join("");
      return "<ol>" + items + "</ol>";
    });

    // Unordered lists (- ... or * ...)
    s = s.replace(/^(?:-\s+|\*\s+).+(?:\n(?:-\s+|\*\s+).+)*/gm, function(list) {
      var items = list.split("\n").map(function(line) {
        var m = line.match(/^(?:-\s+|\*\s+)(.+)$/);
        return m ? "<li>" + m[1] + "</li>" : "";
      }).join("");
      return "<ul>" + items + "</ul>";
    });

    // Paragraphs: wrap any remaining text in <p> and line breaks <br>
    var parts = s.split(/\n{2,}/).map(function(block) {
      // Skip adding <p> for certain block-level elements
      if (/^<(?:ul|ol|pre|h|blockquote)/.test(block.trim())) {
        return block;
      }
      var html = block.replace(/\n/g, "<br>");
      return "<p>" + html + "</p>";
    }).join("");

    return sanitizeBlocks(parts);
  }

  function sanitizeBlocks(html) {
    try {
      var doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html");
      // Remove potentially unsafe elements
      ["script", "style", "iframe", "object", "embed"].forEach(function(sel) {
        doc.querySelectorAll(sel).forEach(function(n) { n.remove(); });
      });
      // Ensure all links open in new tab securely
      doc.querySelectorAll("a").forEach(function(a) {
        a.setAttribute("rel", "noopener noreferrer");
        a.setAttribute("target", "_blank");
      });
      return doc.body.firstChild.innerHTML;
    } catch (_) {
      return html;
    }
  }

  function highlightIfPossible(container) {
    if (!CFG.enableHighlight) return;
    if (window.Prism && typeof Prism.highlightAllUnder === "function") {
      Prism.highlightAllUnder(container);
    }
  }

  /* ------------------------ UI Build ------------------------ */
  // Builds the chat widget UI elements and injects into page
  function build() {
    // Create launcher button
    var launcher = document.createElement("button");
    launcher.id = "cw-launcher";
    launcher.setAttribute("aria-label", "Open chat");
    launcher.innerHTML =
      '<div class="cw-avatar-wrap">' +
        '<img src="' + esc(CFG.avatarUrl) + '" alt="Tony Avatar">' +
        '<div class="cw-bubble">1</div>' +
      '</div>';
    document.body.appendChild(launcher);

    // Create chat panel root
    var root = document.createElement("div");
    root.className = "cw-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Tony Chat");
    root.innerHTML = "";
    document.body.appendChild(root);

    // Header section with title and close button
    var hdr = document.createElement("div");
    hdr.className = "cw-header";
    hdr.innerHTML =
      '<div class="cw-head">' +
        '<div class="cw-title">' + esc(CFG.title) + '</div>' +
        (CFG.subtitle ? '<div class="cw-subtitle">' + esc(CFG.subtitle) + '</div>' : '') +
      '</div>' +
      '<button class="cw-close" aria-label="Close chat">&times;</button>';
    root.appendChild(hdr);

    // Messages pane
    var pane = document.createElement("div");
    pane.className = "cw-messages";
    pane.id = "cw-messages";
    pane.setAttribute("role", "log");
    root.appendChild(pane);

    // Input form
    var form = document.createElement("form");
    form.className = "cw-form";
    form.setAttribute("novalidate", "novalidate");
    form.innerHTML =
      '<textarea id="cw-input" class="cw-input" placeholder="Type a message..." rows="1"></textarea>' +
      '<button type="submit" id="cw-send" class="cw-send" aria-label="Send">' +
        '<svg viewBox="0 0 20 20"><path d="M2 2 L18 10 L2 18 L2 11 L11 10 L2 9 Z"></path></svg>' +
      '</button>';
    root.appendChild(form);

    // Reference UI elements
    UI.launcher = launcher;
    UI.root = root;
    UI.pane = pane;
    UI.form = form;
    UI.input = form.querySelector("#cw-input");
    UI.send = form.querySelector("#cw-send");
    UI.close = root.querySelector(".cw-close");

    // Show greeting message on open (if configured)
    if (CFG.greeting) {
      addAssistant(CFG.greeting);
    }

    // Event listeners for open/close
    launcher.addEventListener("click", function() {
      OPEN = true;
      root.style.display = "block";
      document.documentElement.classList.add("cw-open");
      computeHeaderOffset();
      UI.input.focus();
      scrollPane();
    });
    UI.close.addEventListener("click", function() {
      OPEN = false;
      root.style.display = "none";
      document.documentElement.classList.remove("cw-open");
    });

    // Submit message on form submit
    form.addEventListener("submit", onSubmit);

    // Auto-grow textarea height on input
    UI.input.addEventListener("input", growInput);
  }

  /* ------------------------ Renderers ------------------------ */
  function addAssistant(text) {
    var row = document.createElement("div");
    row.className = "cw-row cw-row-assistant";
    var bubble = document.createElement("div");
    bubble.className = "cw-bubble cw-bubble-assistant";
    bubble.innerHTML = mdToHtml(text);
    row.appendChild(bubble);
    UI.pane.appendChild(row);
    highlightIfPossible(bubble);
    scrollPane();
  }

  function addUser(text) {
    var row = document.createElement("div");
    row.className = "cw-row cw-row-user";
    var bubble = document.createElement("div");
    bubble.className = "cw-bubble cw-bubble-user";
    bubble.textContent = text;
    row.appendChild(bubble);
    UI.pane.appendChild(row);
    scrollPane();
  }

  function addTyping() {
    var row = document.createElement("div");
    row.className = "cw-row cw-row-assistant cw-typing";
    row.innerHTML = '<div class="cw-bubble cw-bubble-assistant"><span class="cw-dots"><i></i><i></i><i></i></span></div>';
    UI.pane.appendChild(row);
    scrollPane();
    return {
      remove: function() { row.remove(); }
    };
  }

  /* ------------------------ Transport ------------------------ */
  // Prepare payload with latest conversation and config for the AI worker
  function payload(userText) {
    // Include recent history (up to maxHistory) plus the new user message
    var msgs = HISTORY.slice(-CFG.maxHistory).concat([{ role: "user", content: userText }]);
    return {
      model: CFG.model,
      temperature: CFG.temperature,
      messages: msgs,
      systemUrl: CFG.systemUrl,
      kbUrl: CFG.kbUrl
      // personaUrl removed – all persona/behavior instructions are in system.md
    };
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (BUSY) return;
    var text = (UI.input.value || "").trim();
    if (!text) return;

    // Render user message in UI
    addUser(text);
    HISTORY.push({ role: "user", content: text });
    UI.input.value = "";
    growInput();

    // Show typing indicator while waiting for response
    var typing = addTyping();
    BUSY = true;
    UI.send.disabled = true;

    try {
      // Send request to AI worker with user message and context URLs
      var r = await fetch(CFG.workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(text))
      });
      var ok = r.ok;
      var data = null, txt = "";
      try {
        data = await r.json();
      } catch(_) {
        txt = await r.text();
      }
      if (!ok) throw new Error((data && data.error) || txt || ("HTTP " + r.status));

      // Extract assistant's reply content from response
      var content = (data && (data.content || data.reply || (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content))) || "";
      if (!content) content = "I couldn’t generate a reply just now.";

      // Render assistant reply in UI
      addAssistant(content);
      HISTORY.push({ role: "assistant", content: content });
    } catch(err) {
      console.error(err);
      addAssistant("Sorry — I ran into an error. Please try again.");
    } finally {
      // Remove typing indicator and re-enable input
      typing.remove();
      BUSY = false;
      UI.send.disabled = false;
      scrollPane();
    }
  }

  /* ------------------------ Boot ------------------------ */
  async function init() {
    // Load configuration from config.json (if exists), then build UI
    try {
      var res = await fetch("/chat-widget/assets/chat/config.json?ts=" + Date.now(), { cache: "no-store" });
      var cfg = await res.json();
      CFG = assign({}, DEFAULTS, cfg || {});
    } catch(_) {
      CFG = assign({}, DEFAULTS);
    }
    // Apply brand accent color and border radius from config
    if (CFG.brand && CFG.brand.accent) setVar('--cw-accent', CFG.brand.accent);
    if (CFG.brand && CFG.brand.radius) setVar('--cw-radius', CFG.brand.radius);

    build();  // build the chat widget UI
  }

  // Initialize on page load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
