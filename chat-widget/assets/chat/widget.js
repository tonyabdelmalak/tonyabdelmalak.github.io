// Tony Copilot - widget.js (v3)
(function () {
  function el(t,c,h){const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;}
  async function readConfig(p){if(!p)return{};try{const r=await fetch(p,{cache:"no-store"});if(!r.ok)return{};return await r.json();}catch{return{};}}
  function escapeHtml(s){return String(s).replace(/[&<>\"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
  async function init(opts={}){
    const theme=await readConfig(opts.configPath); const cfg={...theme,...opts};
    if(!cfg.proxyUrl){console.error("[Copilot] Missing proxyUrl");return;}
    const container=el("div","copilot-container");
    const launch=el("button","copilot-launch");
    const panel=el("div","copilot-panel");
    const header=el("div","copilot-header",cfg.title||"Copilot");
    const body=el("div","copilot-body");
    body.insertAdjacentHTML("beforeend",`<div class="copilot-msg">${cfg.greeting||"How can I help?"}</div>`);
    const inputRow=el("div","copilot-input");
    const input=el("input"); input.placeholder="Type a message...";
    const send=el("button",null,"Send");
    inputRow.appendChild(input); inputRow.appendChild(send);
    panel.appendChild(header); panel.appendChild(body); panel.appendChild(inputRow);
    container.appendChild(launch); container.appendChild(panel); document.body.appendChild(container);
    function toggle(){panel.style.display=panel.style.display==="flex"?"none":"flex";} launch.addEventListener("click",toggle);
    async function ask(text){
      const q=(text||"").trim(); if(!q) return;
      body.insertAdjacentHTML("beforeend",`<div class="copilot-msg"><b>You:</b> ${escapeHtml(q)}</div>`); input.value="";
      try{
        const res=await fetch(cfg.proxyUrl,{method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({messages:[{role:"user",content:q}],system:cfg.system||null,temperature:0.3})});
        const data=await res.json().catch(()=>({}));
        const reply=data?.reply||data?.choices?.[0]?.message?.content||"(no reply)";
        body.insertAdjacentHTML("beforeend",`<div class="copilot-msg"><b>Agent:</b> ${escapeHtml(reply)}</div>`);
        body.scrollTop=body.scrollHeight;
      }catch(e){body.insertAdjacentHTML("beforeend",`<div class="copilot-msg"><b>Agent:</b> (network error)</div>`);}
    }
    send.addEventListener("click",()=>ask(input.value));
    input.addEventListener("keydown",(e)=>{if(e.key==="Enter")ask(input.value);});
  }
  window.TonyChatWidget={init};
  window.CopilotWidget=function(o){this.o=o;this.init=()=>init(this.o);};
})();
