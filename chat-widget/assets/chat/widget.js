/* Chat widget: tight layout, no center icons, avatar fixed, auto-offset for side rail */
(function(){
  // 1) Set your avatar image path here (use a real image in your repo)
  const AVATAR_SRC = "/assets/chat/avatar-tony.jpg"; // <- change if your photo lives elsewhere

  function el(tag, cls){ const n = document.createElement(tag); if(cls) n.className = cls; return n; }

  function createLauncher(){
    const btn = el('button','chat-launcher');
    btn.id = 'chat-launcher';
    btn.setAttribute('aria-label','Open chat');
    btn.innerHTML = `<img src="${AVATAR_SRC}" alt="Tony">`;
    document.body.appendChild(btn);
    return btn;
  }

  function createContainer(){
    const box = el('section','chat-container');
    box.innerHTML = `
      <header class="chat-header">
        <div class="title">
          <img src="${AVATAR_SRC}" alt="Tony">
          <div>
            <div>Chat with Tony</div>
            <div class="sub">We are online!</div>
          </div>
        </div>
        <button class="close" aria-label="Close">✕</button>
      </header>

      <div class="chat-messages" id="chat-messages">
        <div class="suggests" id="chat-suggests">
          <button class="suggest">Show me your dashboards</button>
          <button class="suggest">What projects are you most proud of?</button>
          <button class="suggest">Open your resume</button>
          <button class="suggest">How did you pivot from HR into analytics?</button>
        </div>
        <div class="msg ai">
          Hi! Ask me anything. I’ll reply here.
        </div>
      </div>

      <div class="chat-input">
        <input id="chat-input" placeholder="Enter your message..." autocomplete="off">
        <button id="chat-send" aria-label="Send">➤</button>
      </div>
    `;
    document.body.appendChild(box);
    return box;
  }

  function scrollToEnd(){
    const m = document.getElementById('chat-messages');
    m && (m.scrollTop = m.scrollHeight);
  }

  function addMsg(text, who='user'){
    const m = document.getElementById('chat-messages');
    const d = el('div','msg ' + (who==='user'?'user':'ai'));
    d.textContent = text;
    m.appendChild(d);
    scrollToEnd();
  }

  function wireUp(box, launcher){
    const close = box.querySelector('.close');
    const input = box.querySelector('#chat-input');
    const send  = box.querySelector('#chat-send');
    const chips = box.querySelectorAll('.suggest');

    const openBox  = () => { box.classList.add('open'); launcher.style.display='none'; };
    const closeBox = () => { box.classList.remove('open'); launcher.style.display='block'; };

    launcher.addEventListener('click', openBox);
    close.addEventListener('click',   closeBox);

    function doSend(){
      const v = input.value.trim();
      if(!v) return;
      addMsg(v,'user');
      input.value='';
      // demo reply – replace with your backend/worker call if needed
      setTimeout(()=> addMsg("Got it — I'll help with that."), 250);
    }
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSend(); });

    chips.forEach(c=>{
      c.addEventListener('click', ()=>{
        addMsg(c.textContent.trim(),'user');
        setTimeout(()=> addMsg('Here’s a quick answer.'), 250);
      });
    });
  }

  /* ===== Rail-aware positioning =====
     If your vertical rail is on the right, keep the chat clear of it.
     Collapsed rail ≈ 72px; expanded ≈ 200px (from your side-rail CSS).
  */
  function updateChatOffset(){
    const rail = document.querySelector('.side-rail');
    const wide = window.matchMedia('(min-width: 900px)').matches;
    let offset = 16; // default right offset (px)

    if (rail && wide && getComputedStyle(rail).display !== 'none') {
      const expanded = rail.classList.contains('is-pinned') ||
                       document.body.classList.contains('rail-expanded');
      offset = expanded ? (200 + 24) : (56 + 24 + 16); // expanded: 224px; collapsed: 96px approx
    }
    document.documentElement.style.setProperty('--chat-right-offset', offset + 'px');
  }

  function observeRail(){
    const rail = document.querySelector('.side-rail');
    if (!rail) return;

    // React to hover expand/collapse via body class and rail class changes
    const obs = new MutationObserver(updateChatOffset);
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    obs.observe(rail, { attributes: true, attributeFilter: ['class','style'] });

    // Also update on mouse events (hover expand)
    rail.addEventListener('mouseenter', updateChatOffset);
    rail.addEventListener('mouseleave', updateChatOffset);
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const launcher = createLauncher();
    const box = createContainer();
    wireUp(box, launcher);

    // Initial offset and listeners
    updateChatOffset();
    observeRail();
    window.addEventListener('resize', updateChatOffset);
  });
})();
