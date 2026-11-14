/* tonyabdelmalak.com: shared behavior for the home page and report pages. No dependencies. */
(function () {
  "use strict";
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Old section links: the AI Interview Practice demo and Resume Optimizer grew into CareerPaver. */
  var legacy = { "#interview-demo": 1, "#resume-optimizer": 1, "#ai-dashboards": "#analytics", "#featured-case-studies": "#analytics", "#projects": "#analytics", "#insights": "#writing", "#reading": "#reading" };
  function routeLegacyHash() {
    var h = location.hash;
    if (!legacy[h] || h === "#reading") return;
    if (legacy[h] === 1) {
      history.replaceState(null, "", "#careerpaver");
      var cp = document.getElementById("careerpaver");
      if (cp) {
        cp.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
        cp.classList.add("is-flash");
        setTimeout(function () { cp.classList.remove("is-flash"); }, 2600);
      }
    } else {
      history.replaceState(null, "", legacy[h]);
      var t = document.querySelector(legacy[h]);
      if (t) t.scrollIntoView();
    }
  }

  function onReady(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }

  onReady(function () {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });

    /* Nav: scrolled shadow, mobile toggle, active section underline */
    var nav = document.querySelector(".nav");
    if (nav) {
      var onScroll = function () { nav.classList.toggle("is-scrolled", window.scrollY > 8); };
      onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
      var toggle = nav.querySelector(".nav__toggle");
      if (toggle) {
        toggle.addEventListener("click", function () {
          var open = nav.classList.toggle("is-open");
          toggle.setAttribute("aria-expanded", open ? "true" : "false");
          toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        });
        nav.querySelectorAll(".nav__links a").forEach(function (a) {
          a.addEventListener("click", function () { nav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-label", "Open menu"); });
        });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape" && nav.classList.contains("is-open")) { nav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); toggle.focus(); } });
      }
      var links = Array.prototype.slice.call(nav.querySelectorAll('.nav__link[href^="#"]'));
      var map = {};
      links.forEach(function (l) { var s = document.querySelector(l.getAttribute("href")); if (s) map[s.id] = l; });
      if ("IntersectionObserver" in window && links.length) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting && map[en.target.id]) {
              links.forEach(function (l) { l.classList.remove("is-active"); l.removeAttribute("aria-current"); });
              map[en.target.id].classList.add("is-active"); map[en.target.id].setAttribute("aria-current", "true");
            }
          });
        }, { rootMargin: "-45% 0px -50% 0px" });
        Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
      }
    }

    /* Reveal on scroll (skipped entirely for reduced motion) */
    var reveals = document.querySelectorAll(".reveal");
    if (!reduceMotion && "IntersectionObserver" in window) {
      var ro = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); ro.unobserve(en.target); } });
      }, { rootMargin: "0px 0px -8% 0px" });
      reveals.forEach(function (el) { ro.observe(el); });
    } else { reveals.forEach(function (el) { el.classList.add("is-in"); }); }

    /* Carousels: manual only (no autoplay), swipe plus 44px arrow buttons */
    document.querySelectorAll("[data-rail]").forEach(function (rail) {
      var track = rail.querySelector(".rail__track");
      var prev = rail.querySelector("[data-prev]"), next = rail.querySelector("[data-next]");
      if (!track) return;
      function step() { var c = track.querySelector(".card"); return c ? c.getBoundingClientRect().width + 24 : track.clientWidth * 0.8; }
      function update() {
        var max = track.scrollWidth - track.clientWidth - 2;
        if (prev) prev.disabled = track.scrollLeft <= 2;
        if (next) next.disabled = track.scrollLeft >= max;
      }
      if (prev) prev.addEventListener("click", function () { track.scrollBy({ left: -step(), behavior: reduceMotion ? "auto" : "smooth" }); });
      if (next) next.addEventListener("click", function () { track.scrollBy({ left: step(), behavior: reduceMotion ? "auto" : "smooth" }); });
      track.addEventListener("scroll", update, { passive: true });
      window.addEventListener("resize", update);
      update();
    });

    /* "Ask AI Tony" buttons open the chat bubble */
    document.querySelectorAll("[data-open-chat]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        var launcher = document.getElementById("cw-launcher");
        if (launcher) { e.preventDefault(); launcher.click(); }
      });
    });

    /* Report pages: table of contents highlight */
    var toc = document.querySelectorAll(".report__toc a");
    if (toc.length && "IntersectionObserver" in window) {
      var tmap = {};
      toc.forEach(function (a) { tmap[a.getAttribute("href").slice(1)] = a; });
      var to = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting && tmap[en.target.id]) { toc.forEach(function (a) { a.classList.remove("is-active"); }); tmap[en.target.id].classList.add("is-active"); } });
      }, { rootMargin: "-30% 0px -60% 0px" });
      Object.keys(tmap).forEach(function (id) { var s = document.getElementById(id); if (s) to.observe(s); });
    }

    routeLegacyHash();
    window.addEventListener("hashchange", routeLegacyHash);

    var y = document.querySelector("[data-year]"); if (y) y.textContent = new Date().getFullYear();
  });

  // Detours sign-up: submit without leaving the page; the form still works without JavaScript.
  document.querySelectorAll("form[data-subscribe]").forEach(function (form) {
    form.addEventListener("submit", function (ev) {
      if (!window.fetch) return;
      ev.preventDefault();
      var box = form.closest(".subscribe"), msg = form.querySelector(".subscribe__msg"), btn = form.querySelector("button");
      var data = {}; new FormData(form).forEach(function (v, k) { data[k] = v; });
      msg.classList.remove("is-error"); msg.textContent = "Sending..."; btn.disabled = true;
      fetch(form.action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
        .then(function (res) {
          if (res && res.ok) { box.classList.add("is-done"); msg.textContent = "Almost done. Check your inbox and click the confirm button."; }
          else { msg.classList.add("is-error"); msg.textContent = (res && res.error) || "Something went wrong. Please try again."; btn.disabled = false; }
        })
        .catch(function () { msg.classList.add("is-error"); msg.textContent = "Something went wrong. Please try again."; btn.disabled = false; });
    });
  });
})();
