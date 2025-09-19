/* Chat widget: real backend, loads config + system.md, no suggestion chips,
   rail-aware offset, avatar fixed, single-instance init with error logging. */
(function(){
  if (window.__TONY_CHAT_INIT__) return;
  window.__TONY_CHAT_INIT__ = true;

  const LOG_PREFIX = "[chat-widget]";
  const PATH_ROOT  = "./chat-widget"; // <— base folder for all widget assets on GitHub Pages
  const PATHS = {
    config:  `${PATH_ROOT}/assets/chat/config.json`,
    system:  `${PATH_ROOT}/system.md`,
    avatar:  `${PATH_ROOT}/assets/chat/avatar-tony.jpg`
  };

  const el = (t,c)=>{ const n=document.createElement(t); if(c) n.className=c; return n; };
  const on = (node,evt,fn)=> node && node.addEventListener(evt,fn,{passive:true});

  // ------- state -------
  const state = {
    config: null,
    systemText: "",
    history: [] // {role:'user'|'assistant', content:string}
  };

  // ------- UI -------
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

  // ------- data loaders -------
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

  // ------- backend call -------
  async function callBackend(user
