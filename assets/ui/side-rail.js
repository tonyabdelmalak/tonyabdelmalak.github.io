/* Injects a compact side rail with links to Tony's pages. */
(function(){
  const LINKS = [
    { href: "/index.html", label: "Home",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M9 22V12h6v10"/></svg>` },
    { href: "/hr_attrition_dashboard_lite.html", label: "Attrition Dashboard",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h16M6 10v8M10 4v14M14 7v11M18 13v5"/></svg>` },
    { href: "/predictive_attrition_case_study.html", label: "Predictive Attrition",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>` },
    { href: "/recruitment_case_study.html", label: "Recruitment",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>` },
    { href: "/attrition_case_study.html", label: "90-Day Attrition",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>` },
    { href: "/interactive_cases_refined/recruitment_funnel_case.html", label: "Recruitment Funnel",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h18L14 12v7l-4 2v-9L3 4z"/></svg>` },
    { href: "/interactive_cases_refined/ai_attrition_model_case.html", label: "AI Attrition Model",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/></svg>` }
  ];

  const ul = LINKS.map(({href,label,icon}) =>
    `<li><a href="${href}" data-label="${label}">${icon}<span>${label}</span></a></li>`
  ).join("");

  const rail = document.createElement("nav");
  rail.className = "side-rail";
  rail.setAttribute("aria-label","Quick navigation");
  rail.innerHTML = `
    <ul>${ul}</ul>
    <button class="rail-pin" aria-pressed="false" aria-label="Pin side navigation">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M14 3l7 7-4 1-4 4-3-3 4-4 1-4zM4 20l6-6"/>
      </svg>
    </button>`;

  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(rail);

    // Active state - handle both root and subdirectory paths
    const currentPath = location.pathname;
    const currentFile = currentPath.split('/').pop() || 'index.html';
    
    rail.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href");
      const hrefFile = href.split('/').pop();
      
      // Match if:
      // 1. Exact path match
      // 2. Filename matches (for subdirectory pages)
      // 3. Home page special case
      if (currentPath === href || 
          currentFile === hrefFile ||
          (href === "/index.html" && (currentPath === "/" || currentPath === "" || currentFile === "index.html"))) {
        a.classList.add("active");
      }
    });

    // Pinning
    const pin = rail.querySelector(".rail-pin");
    pin.addEventListener("click", () => {
      const pinned = rail.classList.toggle("is-pinned");
      pin.setAttribute("aria-pressed", String(pinned));
    });
  });
})();
