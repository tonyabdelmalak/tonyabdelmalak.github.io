/* Chat widget: in-box toolbar, tighter spacing, header avatar fixed */
(function(){
  // Quick-link buttons INSIDE the chat box
  const LINKS = [
    { href: "/hr_attrition_dashboard_lite.html", label: "Attrition Dashboard", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16M6 10v8M10 4v14M14 7v11M18 13v5"/></svg>` },
    { href: "/predictive_attrition_case_study.html", label: "Predictive Case Study", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 10a2 2 0 114 0h2a2 2 0 114 0v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-4a2 2 0 114 0v-2z"/></svg>` },
    { href: "/recruitment-funnel.html", label: "Recruitment Funnel", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4h18L14 12v7l-4 2v-9L3 4z"/></svg>` },
    { href: "/sentiment.html", label: "Sentiment Analysis", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"/></svg>` }
  ];

  function el(tag, cls){ const n = document.createElement(tag); if(cls) n.className = cls; return n; }

  function createLauncher(){
    const btn = el('button','chat-launcher');
    btn.id = 'chat-launcher';
    btn.setAttribute('aria-label','Open chat');

    // IMPORTANT: Set your avatar path ONCE here.
    const avatarSrc = "/assets/chat/avatar-tony.jpg";   // <— update if your image lives elsewhere
    btn.innerHTML = `<img src="${avatarSrc}" alt="Tony">`;
    // stash the src so the header can reuse the exact same image
    btn.dataset.avatar = avatarSrc;

    document.body.appendChild(btn);
    return btn;
  }

  function createContainer(avatarSrc){
    const box = el('section','chat-container');
    box.innerHTML = `
      <header class="chat-header">
        <div class="title">
          <img src="${avatarSrc}" alt="Tony">
          <div>
            <div>Chat with Tony</div>
            <div class="sub">We are online!</div>
          </div>
        </div>
        <button class="close" aria-label="Close">✕</button>
      </header>

      <nav class="chat-toolbar" aria-label="Quick links">
        ${LINKS.map(l => `<a href="${l.href}" title="${l.label}" aria-label="${l.label}">${l.svg}</a>`).join('')}
      </nav>

      <div class="chat-messages" id="chat-messages">
        <div class="suggests" id="chat-suggests">
          <button class="suggest">Show me your dashboards</button>
          <button class="suggest">What projects are you most proud of?</button>
          <button class="suggest">Open your resume</button>
          <button class="suggest">How did you pivot from HR into analytics?</button>
        </div>
        <div class="msg ai">Hi! I can answer questions or take you straight to dashboards via the buttons above.</div>
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
      // demo reply – replace with your Worker call if needed
      setTimeout(()=> addMsg("Got it — I'll help with that."), 250);
    }
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSend(); });

    chips.forEach(c=>{
      c.addEventListener('click', ()=>{
        addMsg(c.textContent.trim(),'user');
        setTimeout(()=> addMsg('Here’s a quick answer — or use the toolbar to jump to a page.'), 250);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const launcher = createLauncher();
    // use the same exact image path for the header avatar
    const avatar = launcher.dataset.avatar || (launcher.querySelector('img')?.src) || '';
    const box = createContainer(avatar);
    wireUp(box, launcher);
  });
})();
