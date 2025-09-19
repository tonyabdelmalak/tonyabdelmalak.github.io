/* Chat widget: ultra-tight, NO suggestion chips, rail-aware offset, avatar fixed,
   robust single-instance init with error logging and guaranteed replies. */
(function(){
  if (window.__TONY_CHAT_INIT__) return;            // prevent double init
  window.__TONY_CHAT_INIT__ = true;

  const AVATAR_SRC = "/assets/chat/avatar-tony.jpg"; // <-- update if needed
  const LOG_PREFIX = "[chat-widget]";

  const el = (t,c)=>{ const n=document.createElement(t); if(c) n.className=c; return n; };
  const on = (node,evt,fn)=> node && node.addEventListener(evt,fn,{passive:true});

  function createLauncher(){
    const btn = el('button','chat-launcher');
    btn.id = 'chat-launcher';
    btn.type = 'button';
    btn.setAttribute('aria-label','Open chat');
    btn.innerHTML = `<img src="${AVATAR_SRC}" alt="Tony">`;
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
          <img src="${AVATAR_SRC}" alt="Tony">
          <div>
            <div>Chat with Tony</div>
            <div class="sub">We are online!</div>
          </div>
        </div>
        <button class="close" aria-label="Close" type="button">✕</button>
      </header>

      <div class="chat-messages" id="chat-messages" aria-live="polite"></div>

      <div class="chat-input">
        <!-- not a form on purpose (avoid page reloads) -->
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

  // very simple demo responder so you can confirm it's live
  function fakeReply(userText){
    const canned = [
      "Thanks! I’m on it.",
      "Got it — what else would you like to see?",
      "Cool. I can also open dashboards or summarize projects.",
      "Noted. Ask me anything!"
    ];
    const pick = canned[Math.floor(Math.random()*canned.length)];
    setTimeout(()=> addMsg(pick,'ai'), 220);
  }

  function wireUp(box, launcher){
    const close = box.querySelector('.close');
    const input = box.querySelector('#chat-input');
    const send  = box.querySelector('#chat-send');

    const openBox  = () => { box.classList.add('open'); launcher.style.display='none'; input?.focus(); };
    const closeBox = () => { box.classList.remove('open'); launcher.style.display='block'; };

    on(launcher,'click', openBox);
    on(close,   'click', closeBox);

    function doSend(){
      try{
        const v = (input?.value || "").trim();
        if(!v) return;
        addMsg(v,'user');
        input.value = "";
        fakeReply(v);                           // replace with your real backend call later
      }catch(e){
        console.error(LOG_PREFIX, "send error", e);
        addMsg("Hmm, something went wrong. Try again?", "ai");
      }
    }

    // handle Enter (but ignore Shift+Enter to allow multi-line later if desired)
    on(input,'keydown', (e)=>{
      if (e.key === 'Enter' && !e.shiftKey){
        e.preventDefault();
        doSend();
      }
    });
    on(send,'click', doSend);

    // safety: prevent any accidental form submits if someone wraps it later
    box.querySelectorAll('form').forEach(f=>{
      on(f,'submit', (e)=>{ e.preventDefault(); doSend(); });
    });
  }

  /* ===== Rail-aware positioning (keeps chat clear of right rail) ===== */
  function updateChatOffset(){
    try{
      const rail = document.querySelector('.side-rail');
      const wide = window.matchMedia('(min-width: 900px)').matches;
      let offset = 16; // px from right

      if (rail && wide && getComputedStyle(rail).display !== 'none') {
        const expanded = rail.classList.contains('is-pinned') ||
                         document.body.classList.contains('rail-expanded');
        offset = expanded ? (200 + 20) : (56 + 20 + 16);  // 220px vs ~92px
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

  /* ===== Bootstrap ===== */
  function init(){
    try{
      if (!document.body) { document.addEventListener('DOMContentLoaded', init, {once:true}); return; }
      const launcher = createLauncher();
      const box = createContainer();
      wireUp(box, launcher);
      updateChatOffset();
      observeRail();
      window.addEventListener('resize', updateChatOffset);

      // greet once so you see life
      setTimeout(()=> addMsg("Hi! Ask me anything — I’ll reply here.", 'ai'), 120);
    }catch(e){
      console.error(LOG_PREFIX, "init failed", e);
    }
  }
  init();
})();
