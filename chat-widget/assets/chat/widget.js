// Minimal, self-contained chat widget (floating launcher + panel)
(function(){const W=window,D=document;if(!W.TonyChatWidget)W.TonyChatWidget={};
function c(t,s){const e=D.createElement(t);if(s)e.className=s;return e;}
async function j(u){try{const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);return await r.json()}catch(e){return null}}
async function t(u){try{const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);return await r.text()}catch(e){return null}}
W.TonyChatWidget.init=async function(o){o=Object.assign({mode:"floating",position:"bottom-right",avatar:"",configPath:"/chat-widget/assets/chat/config.json",systemPath:"/chat-widget/assets/chat/system.md"},o||{});
const [cfg,sys]=await Promise.all([j(o.configPath),t(o.systemPath)]);
const conf=cfg||{title:"Ask Tony’s Copilot",greeting:"Hi — I’m Tony’s Copilot. Want a quick tour, dashboards, or résumé?",brand:{accent:"#4f46e5",radius:"12px"}};
const launcher=c("div","tcw-launcher"); if(o.avatar){const i=c("img");i.src=o.avatar;i.alt="Chat with Tony";launcher.appendChild(i)}else{const s=c("span");s.textContent="💬";launcher.appendChild(s)}
D.body.appendChild(launcher);
const panel=c("div","tcw-panel"),header=c("div","tcw-header"),av=c("div","tcw-avatar"),ttl=c("div","tcw-title");ttl.textContent=conf.title||"Ask Tony’s Copilot";
if(o.avatar){const i=c("img");i.src=o.avatar;i.alt="Tony";i.style.width="100%";i.style.height="100%";i.style.objectFit="cover";av.appendChild(i)}
header.appendChild(av);header.appendChild(ttl);
const body=c("div","tcw-body"),g=c("div","tcw-greeting");g.textContent=conf.greeting||"Hi — I’m Tony’s Copilot. Want a quick tour, dashboards, or résumé?";body.appendChild(g);
const chips=c("div","tcw-chips");["Show dashboards","Career pivot","Résumé"].forEach(ti=>{const ch=c("div","tcw-chip");ch.textContent=ti;ch.onclick=()=>add("You",ti);chips.appendChild(ch)});body.appendChild(chips);
function add(who,txt){const m=c("div","tcw-msg");m.textContent=(who==="You"?"You: ":"Agent: ")+txt;body.appendChild(m);body.scrollTop=body.scrollHeight}
add("Agent","Ask about Tony’s dashboards, projects, or career pivot.");
const bar=c("div","tcw-inputbar"),inp=c("input"),btn=c("button");inp.placeholder="Type your question…";btn.textContent="Send";
btn.onclick=()=>{const v=inp.value.trim();if(!v)return;add("You",v);add("Agent","Thanks — I can show projects, outcomes, or résumé. Which would you like?");inp.value=""};
bar.appendChild(inp);bar.appendChild(btn);
panel.appendChild(header);panel.appendChild(body);panel.appendChild(bar);D.body.appendChild(panel);
try{const root=D.documentElement;if(conf.brand?.accent)root.style.setProperty("--tcw-accent",conf.brand.accent);if(conf.brand?.radius)root.style.setProperty("--tcw-radius",conf.brand.radius);}catch(e){}
let open=false;function toggle(){open=!open;panel.style.display=open?"block":"none"} launcher.onclick=toggle;
if(o.position==="bottom-left"){launcher.style.right="auto";launcher.style.left="20px";panel.style.right="auto";panel.style.left="20px";}
};})();
