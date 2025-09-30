// ============================================================================
// Tony Chat Widget — EXTENDED BUILD (FULL)
// - Launcher anchored below site header (right edge), always visible
// - Launcher hides when chat opens; reappears on close
// - Panel: white; assistant: navy; user: light gray (#e0e0e0) with white text
// - Input: light gray with white text; paper-plane send icon
// - Title: “What’s on your mind?”; Auto-greeting on open
// - Markdown rendering (bold/italic, lists, links, inline/blocks code)
// - Optional lightweight code highlighting via <pre><code class="lang-...">
// - Enter to send; Shift+Enter newline; typing dots; focus management
// - No history persistence; temperature=0.275
// - Worker dynamically merges system.md/about-tony.md/persona.json
// ============================================================================

(function(){
  "use strict";

  /* ------------------------ Defaults ------------------------ */
  var DEFAULTS = {
    workerUrl: "/chat",
    systemUrl: "/chat-widget/assets/chat/system.md",
    kbUrl: "/chat-widget/assets/chat/about-tony.md",
    personaUrl: "/chat-widget/assets/chat/persona.json",
    model: "llama-3.1-8b-instant",
    temperature: 0.275,
    title: "What's on your mind?",
    subtitle: "",
    brand: { accent:"#2f3a4f", radius:"18px" },
    greeting: "Hi, I’m Tony. I'm happy to answer your questions about my background, specific projects/dashboards, or what I’m currently working towards. What's on your mind?",
    persistHistory: false,
    maxHistory: 16,
    avatarUrl: "/assets/img/profile-img.jpg",
    enableHighlight: true
  };

  var CFG = null;
  var UI = {};
  var HISTORY = [];           // session-only
  var OPEN = false;
  var BUSY = false;

  /* ------------------------ Utils ------------------------ */
  function esc(s){ return String(s||"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
  function assign(){ var o={}; for(var i=0;i<arguments.length;i++){ var s=arguments[i]||{}; for(var k in s)o[k]=s[k]; } return o; }
  function setVar(n, v){ document.documentElement.style.setProperty(n, v); }
  function scrollPane(){ if(UI.pane) UI.pane.scrollTop = UI.pane.scrollHeight + 999; }
  function growInput(){
    var el = UI.input; if(!el) return;
    el.style.height = "auto";
    var h = Math.min(el.scrollHeight, 140);
    el.style.height = h + "px";
  }
  function computeHeaderOffset(){
    var el = document.querySelector('header.site-header') ||
             document.querySelector('header.header') ||
             document.querySelector('nav.navbar') ||
             document.querySelector('nav[role="navigation"]') ||
             document.querySelector('header') ||
             document.querySelector('nav');
    var h = el ? (el.offsetHeight || 64) : 64;
    document.documentElement.style.setProperty('--cw-top-offset', (h + 24) + 'px');
  }

  /* ------------------------ Markdown (minimal) ------------------------ */
  function mdToHtml(input){
    var s = String(input||"");
    s = s.replace(/\r\n/g,"\n");
    s = esc(s);

    s = s.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, function(_,lang,code){
      var langClass = lang ? " class=\"language-"+lang.toLowerCase()+"\"" : "";
      return "<pre><code"+langClass+">"+code.replace(/</g,"&lt;")+"</code></pre>";
    });

    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

    s = s.replace(/^(#{1,6})\s*(.+)$/gm, function(_,hashes,text){
      return "<strong>"+text.trim()+"</strong>";
    });

    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    s = s.replace(/^(?:\d+\.)\s+.+(?:\n\d+\.\s+.+)*/gm, function(list){
      var items = list.split("\n").map(function(line){
        var m = line.match(/^\d+\.\s+(.+)$/); return m? "<li>"+m[1]+"</li>": "";
      }).join("");
      return "<ol>"+items+"</ol>";
    });

    s = s.replace(/^(?:-\s+|\*\s+).+(?:\n(?:-\s+|\*\s+).+)*/gm, function(list){
      var items = list.split("\n").map(function(line){
        var m = line.match(/^(?:-\s+|\*\s+)(.+)$/); return m? "<li>"+m[1]+"</li>": "";
      }).join("");
      return "<ul>"+items+"</ul>";
    });

    var parts = s.split(/\n{2,}/).map(function(block){
      if (/^<(?:ul|ol|pre|h\d|blockquote)/.test(block.trim())) return block;
      var html = block.replace(/\n/g, "<br>");
      return "<p>"+html+"</p>";
    }).join("");

    return sanitizeBlocks(parts);
  }

  function sanitizeBlocks(html){
    try{
      var doc = new DOMParser().parseFromString("<div>"+html+"</div>", "text/html");
      ["script","style","iframe","object","embed"].forEach(function(sel){
        doc.querySelectorAll(sel).forEach(function(n){ n.remove(); });
      });
      doc.querySelectorAll("a").forEach(function(a){
        a.setAttribute("rel","noopener noreferrer");
        a.setAttribute("target","_blank");
      });
      return doc.body.firstChild.innerHTML;
    }catch(_){
      return html;
    }
  }

  function highlightIfPossible(container){
    if (!CFG.enableHighlight) return;
    if (window.Prism && typeof Prism.highlightAllUnder === "function") {
      Prism.highlightAllUnder(container);
    } else if (window.hljs && typeof hljs.highlightElement === "function") {
      container.querySelectorAll('pre code').forEach(function(block){ hljs.highlightElement(block); });
    }
  }

  /* ------------------------ DOM ------------------------ */
  function build(){
    var launcher = document.createElement("button");
    launcher.id = "cw-launcher";
    launcher.setAttribute("aria-label","Open chat");
    launcher.innerHTML =
      '<div class="cw-avatar-wrap">'+
        '<img src="'+esc(CFG.avatarUrl)+'" alt="Tony" />'+
        '<div class="cw-bubble">···</div>'+
      '</div>';
    document.body.appendChild(launcher);

    var root = document.createElement("div");
    root.className = "cw-root";
    root.setAttribute("role","dialog");
    root.setAttribute("aria-label","Tony Chat");

    var hdr = document.createElement("div");
    hdr.className = "cw-header";
    hdr.innerHTML =
      '<div class="cw-head">'+
        '<div class="cw-title">'+esc(CFG.title || "Chat")+'</div>'+
        (CFG.subtitle ? '<div class="cw-subtitle">'+esc(CFG.subtitle)+'</div>' : '')+
      '</div>'+
      '<button class="cw-close" id="cw-close" type="button" aria-label="Close">×</button>';
    root.appendChild(hdr);

    var pane = document.createElement("div");
    pane.className = "cw-messages"; pane.id = "cw-messages";
    pane.setAttribute("role","log"); pane.setAttribute("aria-live","polite");
    root.appendChild(pane);

    var form = document.createElement("form");
    form.className = "cw-form"; form.setAttribute("novalidate","novalidate");
    form.innerHTML =
      '<label for="cw-input" class="cw-visually-hidden">Type your message</label>'+
      '<textarea id="cw-input" class="cw-input" rows="1" placeholder="Type your message…" autocomplete="off"></textarea>'+
      '<button class="cw-send" id="cw-send" type="submit" aria-label="Send">'+
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>'+
      '</button>';
    root.appendChild(form);

    document.body.appendChild(root);

    UI.launcher = launcher;
    UI.root = root;
    UI.pane = pane;
    UI.form = form;
    UI.input = form.querySelector("#cw-input");
    UI.send = form.querySelector("#cw-send");
    UI.close = hdr.querySelector("#cw-close");

    setVar('--cw-accent', (CFG.brand && CFG.brand.accent) || '#2f3a4f');
    setVar('--cw-radius', (CFG.brand && CFG.brand.radius) || '18px');

    launcher.addEventListener("click", openChat);
    UI.close.addEventListener("click", closeChat);
    UI.input.addEventListener("input", growInput);
    UI.input.addEventListener("keydown", onKeyDown);
    UI.form.addEventListener("submit", onSubmit);

    computeHeaderOffset();
    window.addEventListener('resize', computeHeaderOffset);
  }

  function onKeyDown(e){
    if(e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      UI.form.dispatchEvent(new Event("submit"));
    }
  }

  function openChat(){
    if(OPEN) return;
    OPEN = true;
    document.body.classList.add("cw-open");
    UI.root.style.display = "block";
    if(CFG.greeting){
      addAssistant(CFG.greeting);
    }
    UI.input.focus();
    growInput();
    scrollPane();
  }

  function closeChat(){
    if(!OPEN) return;
    OPEN = false;
    document.body.classList.remove("cw-open");
    UI.root.style.display = "none";
    if(!CFG.persistHistory){
      HISTORY = [];
      UI.pane.innerHTML = "";
    }
  }

  /* ------------------------ Renderers ------------------------ */
  function addAssistant(text){
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

  function addUser(text){
    var row = document.createElement("div");
    row.className = "cw-row cw-row-user";
    var bubble = document.createElement("div");
    bubble.className = "cw-bubble cw-bubble-user";
    bubble.textContent = text;
    row.appendChild(bubble);
    UI.pane.appendChild(row);
    scrollPane();
  }

  function addTyping(){
    var row = document.createElement("div");
    row.className = "cw-row cw-row-assistant cw-typing";
    row.innerHTML = '<div class="cw-bubble cw-bubble-assistant"><span class="cw-dots"><i></i><i></i><i></i></span></div>';
    UI.pane.appendChild(row);
    scrollPane();
    return { remove: function(){ row.remove(); } };
  }

  /* ------------------------ Transport ------------------------ */
  function payload(userText){
    var msgs = HISTORY.slice(-CFG.maxHistory).concat([{role:"user", content:userText}]);
    return {
      model: CFG.model,
      temperature: CFG.temperature,
      messages: msgs,
      systemUrl: CFG.systemUrl,
      kbUrl: CFG.kbUrl,
      personaUrl: CFG.personaUrl
    };
  }

  async function onSubmit(e){
    e.preventDefault();
    if(BUSY) return;
    var text = (UI.input.value || "").trim();
    if(!text) return;

    addUser(text);
    HISTORY.push({role:"user", content:text});
    UI.input.value = ""; growInput();

    var typing = addTyping(); BUSY = true; UI.send.disabled = true;

    try{
      var r = await fetch(CFG.workerUrl, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(payload(text))
      });
      var ok = r.ok;
      var data = null, txt = "";
      try{ data = await r.json(); }catch(_){ txt = await r.text(); }
      if(!ok) throw new Error((data && data.error) || txt || ("HTTP "+r.status));

      var content = (data && (data.content || data.reply || (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content))) || "";
      if(!content) content = "I couldn’t generate a reply just now.";
      addAssistant(content);
      HISTORY.push({role:"assistant", content:content});
    }catch(err){
      addAssistant("Sorry — I ran into an error. Please try again.");
      console.error(err);
    }finally{
      typing.remove(); BUSY = false; UI.send.disabled = false; scrollPane();
    }
  }

  /* ------------------------ Boot ------------------------ */
  async function init(){
    try{
      var res = await fetch("/chat-widget/assets/chat/config.json?ts="+Date.now(), {cache:"no-store"});
      var cfg = await res.json();
      CFG = assign({}, DEFAULTS, cfg || {});
    }catch(_){
      CFG = assign({}, DEFAULTS);
    }
    if(CFG.brand && CFG.brand.accent) setVar('--cw-accent', CFG.brand.accent);
    if(CFG.brand && CFG.brand.radius) setVar('--cw-radius', CFG.brand.radius);

    build();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})();
