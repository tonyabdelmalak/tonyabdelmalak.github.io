/* Rail + docked chat avatar. On mobile, avatar undocks to bottom-right. */
(function(){
  const LINKS = [
    { href: "/index.html", label: "Home",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M9 22V12h6v10"/></svg>` },
    { href: "/hr_attrition_dashboard_lite.html", label: "Attrition Dashboard",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h16M6 10v8M10 4v14M14 7v11M18 13v5"/></svg>` },
    { href: "/predictive_attrition_case_study.html", label: "Predictive Case Study",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 10a2 2 0 114 0h2a2 2 0 114 0v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-4a2 2 0 114 0v-2z"/></svg>` },
    { href: "/recruitment_case_study.html", label: "Recruitment Case Study",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-3-3.87M9 21v-2a4 4 0 0 1 3-3.87M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 11c1.5 0 3 1 3 3v2"/></svg>` },
    { href: "/recruitment-funnel.html", label: "Recruitment Funnel",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h18L14 12v7l-4 2v-9L3 4z"/></svg>` },
    { href: "/sentiment.html", label: "Sentiment Analysis",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"/></svg>` }
  ];

  function buildRail(){
    const ul = LINKS.map(({href,label,icon}) =>
      `<li><a href="${href}" data-label="${label}">${icon}<span>${label}</span></a></li>`
    ).join("");

    const rail = document.createElement("nav");
    rail.className = "side-rail";
    rail.setAttribute("aria-label","Quick navigation");
    rail.innerHTML = `
      <ul>${ul}</ul>
      <div class="rail-footer">
        <button class="rail-pin" aria-pressed="false" aria-label="Pin side navigation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M14 3l7 7-4 1-4 4-3-3 4-4 1-4zM4 20l6-6"/>
          </svg>
        </button>
      </div>
    `;
    return rail;
  }

  function attachChatToRail(){
    const rail = document.querySelector(".side-rail");
    const footer = rail?.querySelector(".rail-footer");
    const launcher = document.querySelector(".chat-launcher, #chat-launcher");
    if (rail && footer && launcher && !footer.contains(launcher)) {
      footer.appendChild(launcher);
      launcher.classList.add("in-rail");
    }
  }

  function detachChatToBody(){
    const rail = document.querySelector(".side-rail");
    const launcher = rail?.querySelector(".chat-launcher, #chat-launcher");
    if (launcher) {
      document.body.appendChild(launcher);
      launcher.classList.remove("in-rail");
      // no inline styles needed; the launcher’s default CSS handles bottom-right
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const rail = buildRail();
    document.body.appendChild(rail);
    document.body.classList.add("has-rail");

    // Active link highlight
    const here = location.pathname.replace(/\/+$/,'') || "/index.html";
    rail.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href").replace(/\/+$/,'');
      if (here.endsWith(href)) a.classList.add("active");
    });

    // Hover expands body padding (no overlap)
    const enter = () => document.body.classList.add("rail-expanded");
    const leave = () => { if(!rail.classList.contains("is-pinned")) document.body.classList.remove("rail-expanded"); };
    rail.addEventListener("mouseenter", enter);
    rail.addEventListener("mouseleave", leave);

    // Pin toggles persistent expansion
    const pin = rail.querySelector(".rail-pin");
    pin.addEventListener("click", () => {
      const pinned = rail.classList.toggle("is-pinned");
      pin.setAttribute("aria-pressed", String(pinned));
      if (pinned) enter(); else leave();
    });

    // Wait for the chat launcher to exist, then dock it
    const tryAttach = () => {
      attachChatToRail();
      if (!rail.querySelector(".chat-launcher, #chat-launcher")) {
        setTimeout(tryAttach, 150); // poll briefly until the widget injects
      }
    };
    tryAttach();

    // On mobile, undock back to bottom-right; on desktop, dock inside rail
    const mq = window.matchMedia("(max-width: 899px)");
    const sync = (e) => { e.matches ? detachChatToBody() : attachChatToRail(); };
    mq.addEventListener ? mq.addEventListener("change", sync) : mq.addListener(sync);
    sync(mq);
  });
})();
