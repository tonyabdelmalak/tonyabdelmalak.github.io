/* Chat widget: real backend, loads config + system.md (in assets/chat),
   no suggestion chips, rail-aware offset, avatar fixed, single-instance init. */
(function(){
  if (window.__TONY_CHAT_INIT__) return;
  window.__TONY_CHAT_INIT__ = true;

  const LOG_PREFIX = "[chat-widget]";
  // OPTION B: keep everything inside /chat-widget/assets/chat
  const PATH_ROOT  = "./chat-widget/assets/chat";
  const PATHS = {
    config:  `${PATH_ROOT}/config.json`,
    system:  `${PATH_ROOT}/system.md`,
    avatar:  `${PATH_ROOT}/avatar-tony.jpg`
  };

  const el = (t,c)=>{ const n=document.createElement(t); if(c) n.className=c; return n; };
  const on = (node,evt,fn)=> node && node.addEventListener(evt,fn,{passive:true});

  const state = { config:null, systemText:"", history:[] };

  // ---------- UI ----------
  function createLauncher(){
    const btn = el('button','chat-launcher');
    btn.id = 'chat-launcher';
    btn.type = 'button';
    btn.setAttribute('aria-label','Open chat');
    btn.innerHTML = `<img src="${PATHS.avatar}" alt="Tony">`;
    document.body.appendChild(btn);
    return btn;
  }

  function createContainer(){
    const box = el('section','chat-container');
    box.setAttribute('role','dialog');
    box.setAttribute('aria-label','Chat with Tony');
    box.innerHTML = `
      <header class="chat-header">
        <div class="title">
          <img src="${PATHS.avatar}" alt="Tony">
          <div>
            <div>Chat with Tony</div>
            <div class="sub">We are online!</div>
          </div>
        </div>
        <button class="close" aria-label="Close" type="button">✕</button>
      </header>

      <div class="chat-messages" id="chat-messages" aria-live="polite"></div>

      <div class="chat-input">
        <input id="chat-input" placeholder="Enter your message..." autocomplete="off" />
        <button id="chat-send" aria-label="Send" type="button">➤</button>
      </div>
    `;
    document.body.appendChild(box);
    return box;
  }

  function scrollToEnd(){
    const m = document.getElementById('chat-messages');
    if (m) m.scrollTop = m.scrollHeight;
  }

  function addMsg(text, who='user'){
    const m = document.getElementById('chat-messages');
    if (!m) return;
    const d = el('div','msg ' + (who==='user'?'user':'ai'));
    d.textContent = text;
    m.appendChild(d);
    scrollToEnd();
  }

  // ---------- loaders ----------
  async function loadConfig(){
    const res = await fetch(PATHS.config, {cache:'no-store'});
    if (!res.ok) throw new Error(`config.json ${res.status}`);
    return res.json();
  }
  async function loadSystem(){
    const res = await fetch(PATHS.system, {cache:'no-store'});
    if (!res.ok) throw new Error(`system.md ${res.status}`);
    return res.text();
  }

  // ---------- backend ----------
  async function callBackend(userText){
    if (!state.config?.proxyUrl) throw new Error("proxyUrl missing in config.json");

    const messages = [
      { role: "system", content: state.systemText },
      ...state.history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
      { role: "user", content: userText }
    ];

    const body = JSON.stringify({
      model: state.config.model || "llama3",
      messages,
      temperature: state.config.temperature ?? 0.3,
      max_tokens: state.config.max_tokens ?? 512
    });

    const resp = await fetch(state.config.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });

    if (!resp.ok) {
      const t = await resp.text().catch(()=> "");
      throw new Error(`Proxy ${resp.status} ${t}`);
    }

    const json = await resp.json();
    const content =
      json?.choices?.[0]?.message?.content ??
      json?.message?.content ??
      json?.content ??
      "Sorry, I couldn’t form a reply.";
    return String(content);
  }

  // ---------- wire up ----------
  function wireUp(box, launcher){
    const close = box.querySelector('.close');
    const input = box.querySelector('#chat-input');
    const send  = box.querySelector('#chat-send');

    const openBox  = () => { box.classList.add('open'); launcher.style.display='none'; input?.focus(); };
    const closeBox = () => { box.classList.remove('open'); launcher.style.display='block'; };

    on(launcher,'click', openBox);
    on(close,   'click', closeBox);

    async function doSend(){
      try{
        const v = (input?.value || "").trim();
        if(!v) return;
        addMsg(v,'user');
        state.history.push({role:'user', content:v});
        input.value = "";

        const typing = el('div','msg ai'); typing.textContent = "…";
        document.getElementById('chat-messages').appendChild(typing);
        scrollToEnd();

        const reply = await callBackend(v);

        typing.remove();
        addMsg(reply,'ai');
        state.history.push({role:'assistant', content:reply});
      }catch(e){
        console.error(LOG_PREFIX, "send error", e);
        addMsg("Hmm, something went wrong reaching the server. Try again in a moment.", "ai");
      }
    }

    on(input,'keydown', (e)=>{
      if (e.key === 'Enter' && !e.shiftKey){
        e.preventDefault();
        doSend();
      }
    });
    on(send,'click', doSend);

    box.querySelectorAll('form').forEach(f=>{
      on(f,'submit', (e)=>{ e.preventDefault(); doSend(); });
    });
  }

  // ---------- rail-aware positioning ----------
  function updateChatOffset(){
    try{
      const rail = document.querySelector('.side-rail');
      const wide = window.matchMedia('(min-width: 900px)').matches;
      let offset = 16;
      if (rail && wide && getComputedStyle(rail).display !== 'none') {
        const expanded = rail.classList.contains('is-pinned') ||
                         document.body.classList.contains('rail-expanded');
        offset = expanded ? (200 + 20) : (56 + 20 + 16);
      }
      document.documentElement.style.setProperty('--chat-right-offset', offset + 'px');
    }catch(e){
      console.warn(LOG_PREFIX, "offset calc failed", e);
    }
  }
  function observeRail(){
    const rail = document.querySelector('.side-rail');
    if (!rail) return;
    const mo = new MutationObserver(updateChatOffset);
    mo.observe(document.body, { attributes:true, attributeFilter:['class'] });
    mo.observe(rail, { attributes:true, attributeFilter:['class','style'] });
    rail.addEventListener('mouseenter', updateChatOffset);
    rail.addEventListener('mouseleave', updateChatOffset);
  }

  // ---------- bootstrap ----------
  async function init(){
    try{
      if (!document.body) { document.addEventListener('DOMContentLoaded', init, {once:true}); return; }
      state.config = await loadConfig();
      state.systemText = await loadSystem();

      const launcher = createLauncher();
      const box = createContainer();
      wireUp(box, launcher);
      updateChatOffset();
      observeRail();
      window.addEventListener('resize', updateChatOffset);

      setTimeout(()=> addMsg(state.config?.greeting || "Hi! Ask me anything — I’ll reply here.", 'ai'), 120);
    }catch(e){
      console.error(LOG_PREFIX, "init failed", e);
      addMsg("The chat failed to initialize. Check that config.json and system.md are reachable.", "ai");
    }
  }
  init();
})();
