/* Report pages: render every chart from its embedded JSON with one shared theme. Requires Plotly. */
(function () {
  "use strict";
  var PALETTE = ["#1e3a8a", "#0f766e", "#b45309", "#0369a1", "#be123c", "#475569", "#14b8a6", "#7c3aed"];
  var FONT = "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  var small = window.matchMedia("(max-width: 640px)");

  function theme(layout) {
    var base = {
      font: { family: FONT, size: 13, color: "#374151" },
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      margin: { t: 16, r: 16, b: 56, l: 64 }, colorway: PALETTE,
      hoverlabel: { bgcolor: "#001e42", bordercolor: "#001e42", font: { color: "#fff", family: FONT } },
      legend: { orientation: "h", y: -0.22, x: 0, font: { size: 12 } },
      xaxis: { gridcolor: "#eef1f5", zerolinecolor: "#e5e7eb", linecolor: "#d1d5db", automargin: true, title: { standoff: 12 } },
      yaxis: { gridcolor: "#eef1f5", zerolinecolor: "#e5e7eb", linecolor: "#d1d5db", automargin: true, title: { standoff: 12 } },
      bargap: 0.28
    };
    var out = JSON.parse(JSON.stringify(base));
    Object.keys(layout || {}).forEach(function (k) {
      if (typeof layout[k] === "object" && !Array.isArray(layout[k]) && out[k]) Object.assign(out[k], layout[k]);
      else out[k] = layout[k];
    });
    if (small.matches) {
      out.margin = { t: 12, r: 8, b: 64, l: 52 }; out.font.size = 12;
      ["xaxis", "yaxis"].forEach(function (ax) {
        var t = out[ax] && out[ax].title && out[ax].title.text;
        if (t && t.length > 26 && t.indexOf("<br>") < 0) { var i = t.lastIndexOf(" ", Math.ceil(t.length / 2) + 4); if (i > 0) out[ax].title.text = t.slice(0, i) + "<br>" + t.slice(i + 1); }
      });
      if (out.margin.l < 110 && layout && layout.margin && layout.margin.l) out.margin.l = Math.min(layout.margin.l, 120);
    }
    return out;
  }

  var CONFIG = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d", "toggleSpikelines"] };

  function render(el, spec) {
    Plotly.react(el, spec.data, theme(spec.layout), CONFIG);
  }

  function init() {
    if (!window.Plotly) return;
    document.querySelectorAll("script[type='application/json'][data-chart]").forEach(function (s) {
      var spec = JSON.parse(s.textContent);
      var el = document.getElementById(s.getAttribute("data-chart"));
      if (!el) return;
      if (spec.variants) {
        var sel = document.querySelector("select[data-for='" + el.id + "']");
        var keys = Object.keys(spec.variants);
        var draw = function (k) { render(el, spec.variants[k]); var cap = document.querySelector("[data-caption-for='" + el.id + "']"); if (cap && spec.captions) cap.textContent = spec.captions[k] || ""; };
        if (sel) sel.addEventListener("change", function () { draw(sel.value); });
        draw(sel ? sel.value : keys[0]);
      } else { render(el, spec); }
    });
  }
  if (document.readyState !== "loading") init(); else document.addEventListener("DOMContentLoaded", init);
})();
