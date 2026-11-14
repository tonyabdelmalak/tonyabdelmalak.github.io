#!/usr/bin/env python3
"""Build /reports/*.html from the real data behind the original dashboard pages.

Every number here comes from the original page it replaces (see SOURCES in each report).
Charts that the original pages computed from data (correlations, scenario endpoints) are
recomputed from that same data, never typed in by hand.

Run from the repo root:  python3 tools/build_reports.py tools/figs.json
"""
import json, sys, html, statistics as st, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIGS = json.load(open(sys.argv[1] if len(sys.argv) > 1 else ROOT / "tools/figs.json"))
OUT = ROOT / "reports"; OUT.mkdir(exist_ok=True)
DEPTS = ["HR", "Sales", "IT", "Finance", "Operations", "Marketing", "Engineering", "Product Development"]

def esc(s): return html.escape(s, quote=True)
def r(v, n=4): return round(v, n) if isinstance(v, float) else v

NAV = """  <a class="skip-link" href="#main">Skip to content</a>
  <header class="nav" role="banner">
    <div class="container nav__inner">
      <a class="nav__brand" href="/">Tony Abdelmalak</a>
      <button class="nav__toggle" type="button" aria-expanded="false" aria-controls="nav-links" aria-label="Open menu"><i data-lucide="menu"></i></button>
      <nav aria-label="Primary">
        <ul class="nav__links" id="nav-links">
          <li><a class="nav__link" href="/#about">About</a></li>
          <li><a class="nav__link" href="/#products">Products</a></li>
          <li><a class="nav__link" href="/#experience">Experience</a></li>
          <li><a class="nav__link is-active" href="/#analytics">Analytics</a></li>
          <li><a class="nav__link" href="/#skills">Skills</a></li>
          <li><a class="nav__link" href="https://www.linkedin.com/in/tony-abdelmalak" target="_blank" rel="noopener">LinkedIn</a></li>
          <li class="nav__mobile-cta"><a class="btn btn--teal" href="/assets/resume/Tony_Abdelmalak_Resume.pdf" target="_blank" rel="noopener"><i data-lucide="file-down"></i>Download Resume</a></li>
        </ul>
      </nav>
      <a class="btn btn--teal btn--sm nav__cta" href="/assets/resume/Tony_Abdelmalak_Resume.pdf" target="_blank" rel="noopener"><i data-lucide="file-down"></i>Download Resume</a>
    </div>
  </header>"""

FOOT = """  <footer class="footer">
    <div class="container footer__inner">
      <p>&copy; <span data-year>2026</span> Tony Abdelmalak · Los Angeles</p>
      <ul class="footer__links">
        <li><a href="/">Home</a></li>
        <li><a href="/#analytics">All reports</a></li>
        <li><a href="https://www.linkedin.com/in/tony-abdelmalak" target="_blank" rel="noopener">LinkedIn</a></li>
      </ul>
    </div>
  </footer>
  <script src="https://cdn.plot.ly/plotly-cartesian-2.35.2.min.js" defer></script>
  <script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js" defer></script>
  <script src="/assets/js/site.js?v=20261113" defer></script>
  <script src="/assets/js/report.js?v=20261113" defer></script>
  <link rel="stylesheet" href="/chat-widget/assets/chat/widget.css?v=20261113">
  <script defer src="/chat-widget/assets/chat/widget.js?v=20261113" data-autostart></script>"""

ALL = {}  # slug -> (title, kicker, blurb) for "more reports"

def chart(cid, spec, title, insight=None, select=None, caption=None, height=380):
    sel = ""
    if select:
        opts = "".join(f'<option value="{esc(k)}">{esc(k)}</option>' for k in select)
        sel = f'<label class="visually-hidden" for="sel-{cid}">Choose a view</label><select id="sel-{cid}" data-for="{cid}">{opts}</select>'
    ins = f'<div class="insight"><i data-lucide="lightbulb"></i><p>{insight}</p></div>' if insight else ""
    cap = f'<p class="note" data-caption-for="{cid}">{caption or ""}</p>' if (caption is not None or select) else ""
    return (f'<div class="panel"><div class="panel__title"><h3>{esc(title)}</h3>{sel}</div>'
            f'<div class="chart" id="{cid}" style="min-height:{height}px" role="img" aria-label="{esc(title)}"></div>'
            f'<script type="application/json" data-chart="{cid}">{json.dumps(spec, separators=(",", ":"))}</script>{cap}{ins}</div>')

def table(headers, rows, num_cols=()):
    th = "".join(f'<th scope="col"{" class=num" if i in num_cols else ""}>{esc(h)}</th>' for i, h in enumerate(headers))
    trs = "".join("<tr>" + "".join(f'<td{" class=num" if i in num_cols else ""}>{esc(str(c))}</td>' for i, c in enumerate(row)) + "</tr>" for row in rows)
    return f'<div class="table-wrap" tabindex="0" role="region" aria-label="Data table"><table class="data"><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table></div>'

def page(slug, title, kicker, blurb, summary, kpis, sections, datanote, sources, extra_head=""):
    ALL[slug] = (title, kicker, blurb)
    toc = "".join(f'<li><a href="#{s[0]}">{esc(s[1])}</a></li>' for s in sections)
    body = "".join(f'<section id="{s[0]}" aria-labelledby="{s[0]}-h"><h2 id="{s[0]}-h">{esc(s[1])}</h2>{s[2]}</section>' for s in sections)
    kp = "".join(f'<div class="kpi"><div class="kpi__num">{esc(k)}</div><div class="kpi__label">{esc(v)}</div></div>' for k, v in kpis)
    src = "".join(f"<li>{s}</li>" for s in sources)
    url = f"https://tonyabdelmalak.com/reports/{slug}.html"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)} | Tony Abdelmalak</title>
  <meta name="description" content="{esc(blurb)}">
  <link rel="canonical" href="{url}">
  <meta name="theme-color" content="#001e42">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Tony Abdelmalak">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(blurb)}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="https://tonyabdelmalak.com/assets/img/reports/{slug}-og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(blurb)}">
  <meta name="twitter:image" content="https://tonyabdelmalak.com/assets/img/reports/{slug}-og.png">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" href="/assets/img/favicon.png">
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500..700;1,9..144,500..700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script>document.documentElement.classList.add("js")</script>
  <link rel="stylesheet" href="/assets/css/site.css?v=20261113">{extra_head}
</head>
<body>
{NAV}
  <main id="main">
    <section class="report-hero">
      <div class="container">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/#analytics"><i data-lucide="arrow-left"></i>All dashboards and case studies</a></nav>
        <p class="eyebrow">{esc(kicker)}</p>
        <h1>{esc(title)}</h1>
        <p>{summary}</p>
        <div class="kpis">{kp}</div>
      </div>
    </section>
    <div class="container report">
      <aside class="report__toc" aria-label="On this page"><h2>On this page</h2><ol>{toc}</ol></aside>
      <article class="report__body">
        {body}
        <div class="datanote"><p><strong>About the data.</strong> {datanote}</p><p><strong>Rebuilt from:</strong></p><ul>{src}</ul></div>
        <section aria-labelledby="more-h"><h2 id="more-h">More reports</h2><div class="report-next">__MORE_{slug}__</div></section>
      </article>
    </div>
  </main>
{FOOT}
</body>
</html>
"""

pages = {}

# ---------------------------------------------------------------- Recruitment funnel
rf_counts = {"data": [{"type": "bar", "x": ["Application", "Phone Screen", "Interview", "Offer", "Hire"], "y": [200, 120, 80, 50, 30],
              "marker": {"color": "#1e3a8a"}, "text": [200, 120, 80, 50, 30], "textposition": "outside", "cliponaxis": False,
              "hovertemplate": "%{x}: %{y} candidates<extra></extra>"}],
             "layout": {"xaxis": {"title": {"text": "Stage"}}, "yaxis": {"title": {"text": "Candidates"}, "rangemode": "tozero"}}}
rf_conv = {"data": [{"type": "scatter", "mode": "lines+markers+text", "x": ["Application to Screen", "Screen to Interview", "Interview to Offer", "Offer to Hire"],
            "y": [60, 67, 62, 60], "text": ["60%", "67%", "62%", "60%"], "textposition": "top center", "line": {"color": "#0f766e", "width": 3}, "marker": {"size": 9},
            "hovertemplate": "%{x}: %{y}%<extra></extra>"}],
           "layout": {"xaxis": {"title": {"text": "Stage transition"}}, "yaxis": {"title": {"text": "Conversion rate (%)"}, "range": [0, 100]}}}
rf_days = {"data": [{"type": "bar", "x": ["Sourcing", "Screening", "Interviewing", "Offer", "Acceptance"], "y": [12, 8, 16, 6, 4], "marker": {"color": ["#94a3b8", "#94a3b8", "#b45309", "#94a3b8", "#94a3b8"]},
            "text": [12, 8, 16, 6, 4], "textposition": "outside", "cliponaxis": False, "hovertemplate": "%{x}: %{y} days<extra></extra>"}],
           "layout": {"xaxis": {"title": {"text": "Stage"}}, "yaxis": {"title": {"text": "Average days in stage"}, "rangemode": "tozero"}}}
rf_trend = {"data": [{"type": "scatter", "mode": "lines+markers", "x": ["Month 1", "Month 2", "Month 3", "Month 4", "Month 5", "Month 6"], "y": [60, 55, 50, 47, 45, 43],
             "line": {"color": "#1e3a8a", "width": 3}, "marker": {"size": 9}, "fill": "tozeroy", "fillcolor": "rgba(30,58,138,.08)", "hovertemplate": "%{x}: %{y} days<extra></extra>"}],
            "layout": {"xaxis": {"title": {"text": "Month"}}, "yaxis": {"title": {"text": "Average time to hire (days)"}, "rangemode": "tozero"}}}
pages["recruitment-funnel"] = page(
    "recruitment-funnel", "Recruitment Funnel Analytics", "Case study · Recruiting",
    "Where candidates drop out of the hiring funnel, which stage takes the longest, and how time to hire trends as the process tightens.",
    "Where candidates drop out of the hiring funnel, which stage takes the longest, and what happens to time to hire when the slowest stage gets attention.",
    [("24%", "faster time to hire (original case study)"), ("8%", "higher offer acceptance (original case study)"), ("16 days", "spent in interviewing, the longest stage")],
    [("funnel", "Where candidates drop off", chart("c-rf-counts", rf_counts, "Candidates at each stage", "The biggest absolute drop is application to phone screen, but the interview to offer step is where qualified people stall. Streamlining interviews was the recommended lever.") +
                                             chart("c-rf-conv", rf_conv, "Conversion between stages")),
     ("time", "Where the time goes", chart("c-rf-days", rf_days, "Average days in each stage", "Interviewing takes 16 of the 46 days. Automating scheduling and widening interviewer availability shortens it most.") +
                                     chart("c-rf-trend", rf_trend, "Average time to hire over six months")),
     ("approach", "Approach", "<p>Map the pipeline end to end, from application to hire, and track conversion and time in stage by role, source and location. Then fix the slowest, leakiest stage first instead of pushing more candidates in at the top.</p><p>The original case study reports that this work cut time to hire by 24% and lifted offer acceptance by 8%. Those outcome figures are from the original write-up; the charts above use its sample data.</p>")],
    "Charts use the sample data published with the original dashboard pages (not client data). The 24% and 8% outcomes are carried over unchanged from the original case study text. Two versions of the stage-time and trend data existed on the old site; this page uses the later interactive-dashboard version.",
    ["interactive_cases_refined/recruitment_funnel_case.html (stage counts, conversion)", "interactive_dashboards/recruitment_funnel_dashboard.html (days in stage, time-to-hire trend)", "Index card text: &ldquo;cut time-to-hire by 24% and boosted offer acceptance by 8%&rdquo;", "Live Tableau version: <a href=\"https://public.tableau.com/views/RecruitmentFunnel_17550659994180/RecruitmentFunnel\" target=\"_blank\" rel=\"noopener\">Recruitment Funnel on Tableau Public</a>"])

# ---------------------------------------------------------------- Predictive attrition
at = FIGS["interactive_cases_refined/attrition_case.html"]
scatter_by = {t["name"]: t for t in at[0]["data"] if t.get("name") in DEPTS}
feat = at[1]["data"][0]
pa_imp = {"data": [{"type": "bar", "orientation": "h", "y": ["Absence", "Promotion", "Compensation", "Performance", "Engagement", "Tenure"], "x": [5, 10, 15, 18, 24, 28],
           "marker": {"color": ["#94a3b8", "#94a3b8", "#94a3b8", "#94a3b8", "#0f766e", "#1e3a8a"]}, "text": ["5%", "10%", "15%", "18%", "24%", "28%"], "textposition": "outside", "cliponaxis": False,
           "hovertemplate": "%{y}: %{x}%<extra></extra>"}],
          "layout": {"xaxis": {"title": {"text": "Share of model importance (%)"}, "range": [0, 34]}, "margin": {"l": 110}}}
pa_risk = {"data": [{"type": "bar", "x": ["High", "Medium", "Low"], "y": [45, 110, 290], "marker": {"color": ["#be123c", "#b45309", "#0f766e"]}, "text": [45, 110, 290], "textposition": "outside", "cliponaxis": False,
            "hovertemplate": "%{x} risk: %{y} employees<extra></extra>"}],
           "layout": {"xaxis": {"title": {"text": "Predicted risk level"}}, "yaxis": {"title": {"text": "Employees"}, "rangemode": "tozero"}}}
variants = {}
for d in ["All departments"] + DEPTS:
    ts = DEPTS if d == "All departments" else [d]
    data = []
    for i, name in enumerate(ts):
        t = scatter_by[name]
        data.append({"type": "scattergl" if False else "scatter", "mode": "markers", "name": name, "x": t["x"], "y": t["y"],
                     "marker": {"size": 7, "opacity": 0.55, "color": ["#1e3a8a", "#0f766e", "#b45309", "#0369a1", "#be123c", "#475569", "#14b8a6", "#7c3aed"][DEPTS.index(name)]},
                     "hovertemplate": name + "<br>Age %{x}<br>Predicted probability %{y:.0%}<extra></extra>"})
    variants[d] = {"data": data, "layout": {"xaxis": {"title": {"text": "Age (years)"}}, "yaxis": {"title": {"text": "Predicted attrition probability"}, "tickformat": ".0%", "range": [-0.05, 1.05]}, "showlegend": d == "All departments"}}
pa_scatter = {"variants": variants}
coef = {"data": [{"type": "bar", "orientation": "h", "y": feat["y"][::-1], "x": [r(v) for v in feat["x"][::-1]], "marker": {"color": "#475569"},
         "hovertemplate": "%{y}: %{x}<extra></extra>"}],
        "layout": {"xaxis": {"title": {"text": "Absolute coefficient (unstandardized)"}, "type": "log"}, "margin": {"l": 170}}}
pages["predictive-attrition"] = page(
    "predictive-attrition", "Predicting Turnover: AI-Driven Attrition Risk", "Case study · Machine learning",
    "A predictive attrition model that flags employees at risk of leaving, so HR can have the stay conversation early.",
    "High turnover was draining institutional knowledge and driving up costs. This model flags employees at risk of voluntary departure so HR teams can step in early, with the model supporting human judgment, not replacing it.",
    [("28%", "lower voluntary attrition within six months"), ("0.72", "model F1 score"), ("0.81", "model AUC")],
    [("drivers", "What drives risk", chart("c-pa-imp", pa_imp, "Feature importance (random forest)", "Tenure and engagement were the strongest predictors. Early-career employees and anyone whose engagement is sliding are where intervention pays off most.") +
                                      chart("c-pa-risk", pa_risk, "How risk is spread across the workforce")),
     ("explore", "Explore predicted risk", chart("c-pa-scatter", pa_scatter, "Predicted attrition probability by age", "Employees with frequent overtime and low job satisfaction show the highest predicted risk in this sample.", select=["All departments"] + DEPTS, caption="Each dot is one employee in the synthetic sample. Pick a department to focus on it.", height=440) +
                                                 chart("c-pa-coef", coef, "Logistic regression coefficients (second model)", None, caption="Coefficients are not standardized, so Monthly Income looks large only because it is measured in dollars. Read this chart for direction of effect, not size; the random forest importances above are the comparable view.")),
     ("method", "Data and method", "<ul><li><strong>Data:</strong> anonymized HRIS fields including tenure, performance ratings, compensation bands, engagement survey scores, promotion history and absence patterns. Personal identifiers removed.</li><li><strong>Features:</strong> cleaned missing values, normalized numeric fields, encoded categories and engineered signals such as time since last promotion.</li><li><strong>Model:</strong> compared logistic regression, random forests and gradient boosting; chose a random forest for its balance of accuracy and interpretability. Final F1 0.72, AUC 0.81 on a held-out test set.</li></ul>"),
     ("ethics", "Ethics", "<p>Sensitive attributes (age, gender, ethnicity) were excluded from the production model and it was audited for disparate impact. Risk scores fed a broader retention conversation, never an automatic decision, and the work was reviewed with legal and privacy partners.</p>"),
     ("results", "Results and lessons", "<p>HR teams aimed stay interviews and development opportunities at people flagged as high risk. Within six months, voluntary attrition was down 28% against the prior year, and the model surfaced systemic issues, such as a lack of mentoring, that shaped broader programs.</p><ul><li><strong>Data quality matters.</strong> A reliable pipeline mattered as much as the model.</li><li><strong>Collaboration is the job.</strong> HR partners, data engineers and leaders had to trust the output.</li><li><strong>Models drift.</strong> Retraining and monitoring were scheduled from day one.</li></ul>")],
    "The exploration chart uses the synthetic employee sample published with the original interactive page (age is shown there to explore the sample; it was excluded from the production model). Importance and risk-distribution figures come from the original interactive dashboard. The 28%, 0.72 and 0.81 outcomes are carried over unchanged from the original case study.",
    ["predictive_attrition_case_study.html (write-up, outcomes)", "interactive_dashboards/ai_attrition_dashboard.html (feature importance, risk distribution)", "interactive_cases_refined/attrition_case.html (employee-level sample, coefficients)"])

# ---------------------------------------------------------------- Early (90-day) attrition
ea_cmp = {"data": [{"type": "bar", "name": "Before", "x": ["Early attrition rate", "Reporting effort", "New-hire ramp-up"], "y": [35, 100, 100], "marker": {"color": "#94a3b8"}, "hovertemplate": "Before: %{y}<extra></extra>"},
                   {"type": "bar", "name": "After", "x": ["Early attrition rate", "Reporting effort", "New-hire ramp-up"], "y": [25, 60, 117], "marker": {"color": "#0f766e"}, "hovertemplate": "After: %{y}<extra></extra>"}],
          "layout": {"barmode": "group", "yaxis": {"title": {"text": "Value"}, "rangemode": "tozero"}}}
ea_line = {"data": [{"type": "scatter", "mode": "lines+markers", "x": ["Month 0", "Month 1", "Month 2", "Month 3", "Month 4", "Month 5", "Month 6"], "y": [35, 32, 30, 28, 27, 26, 25],
            "line": {"color": "#1e3a8a", "width": 3}, "marker": {"size": 9}, "hovertemplate": "%{x}: %{y}%<extra></extra>"}],
           "layout": {"xaxis": {"title": {"text": "Months since interventions"}}, "yaxis": {"title": {"text": "90-day attrition rate (%)"}, "range": [0, 40]}}}
ea_uplift = {"data": [{"type": "bar", "orientation": "h", "y": ["Manager training", "Structured day-1 plan", "Mentor assignment"], "x": [8, 12, 18], "marker": {"color": ["#94a3b8", "#0369a1", "#0f766e"]},
              "text": ["8%", "12%", "18%"], "textposition": "outside", "cliponaxis": False, "hovertemplate": "%{y}: %{x}% uplift<extra></extra>"}],
             "layout": {"xaxis": {"title": {"text": "Estimated retention uplift (%)"}, "range": [0, 22]}, "margin": {"l": 150}}}
pages["early-attrition"] = page(
    "early-attrition", "Reducing 90-Day Attrition", "Case study · Predictive and prescriptive analytics",
    "Predictive and prescriptive analytics to decide where a limited onboarding budget does the most good for early retention.",
    "After a stretch of fast hiring, early attrition spiked. Leadership had a limited budget and a real question: redesign onboarding, train managers, offer incentives, or some mix?",
    [("28%", "lower early attrition"), ("~40%", "less manual reporting"), ("17%", "faster new-hire ramp-up")],
    [("impact", "What changed", chart("c-ea-cmp", ea_cmp, "Before and after the interventions", caption="Early attrition is shown in percent; reporting effort and ramp-up are indexed so that before = 100.") + chart("c-ea-line", ea_line, "90-day attrition after rollout", "Attrition fell from 35% to 25% within six months of the onboarding redesign and manager enablement.")),
     ("levers", "Which levers worked", chart("c-ea-uplift", ea_uplift, "Estimated uplift by intervention", "Mentor assignment and a structured first day did the most for early-career cohorts; manager training mattered most where specific managers were the issue.")),
     ("method", "Data and method", "<ul><li><strong>Data foundation:</strong> HRIS, ATS, LMS, survey and scheduling data joined into one governed dataset with PII masking, role-based access and small-cell suppression.</li><li><strong>Predictive:</strong> survival analysis (Cox proportional hazards) to see when risk peaks, and gradient boosting with SHAP values to surface drivers such as first-week schedule adherence, mentor assignment and pay-band misalignment.</li><li><strong>Uplift:</strong> a T-learner estimated the causal effect of each intervention by segment.</li><li><strong>Prescriptive:</strong> a linear program allocated budget across sites and cohorts to maximize retained days within cost and fairness limits. It recommended about 60% to onboarding redesign for the highest-risk cohorts and 40% to manager training.</li></ul>"),
     ("outputs", "Model outputs", "<p>The original analysis outputs, shown as published (synthetic data).</p><figure class=\"panel\" style=\"margin:1rem 0\"><img src=\"/assets/img/reports/ea-shap_summary.webp\" width=\"1200\" height=\"800\" loading=\"lazy\" alt=\"SHAP feature importance: first-week schedule adherence, mentor assigned and LMS completion rate lead; offer salary band mismatch and manager span push risk up\"><figcaption class=\"note\">SHAP drivers of early attrition. Green features lower risk when present; red features raise it.</figcaption></figure><figure class=\"panel\" style=\"margin:1rem 0\"><img src=\"/assets/img/reports/ea-survival_curve.webp\" width=\"1200\" height=\"800\" loading=\"lazy\" alt=\"Survival curves over 90 days: mentored cohort stays near 47 percent at day 90 versus about 23 percent without a mentor\"><figcaption class=\"note\">Survival analysis: probability of staying over the first 90 days, mentored versus not.</figcaption></figure><figure class=\"panel\" style=\"margin:1rem 0\"><img src=\"/assets/img/reports/ea-optimization_allocation.webp\" width=\"1200\" height=\"800\" loading=\"lazy\" alt=\"Bar chart of optimal budget share: Cohort A 50 percent, Cohort B 30 percent, Cohort C 20 percent\"><figcaption class=\"note\">Prescriptive optimization: recommended budget share by cohort.</figcaption></figure>"),
     ("results", "Results", "<p>Within one quarter of launch, early attrition fell 28% across the pilot groups, manual reporting time dropped about 40% thanks to automated pipelines and scorecards, and new-hire ramp-up improved 17% on productivity KPIs. Leaders got a clear answer on where to invest.</p>")],
    "Charts use the sample data from the original interactive dashboard (the old site had two near-identical copies; this uses the version that also includes the uplift chart). Outcome figures are carried over unchanged from the original case study.",
    ["attrition_case_study.html (write-up, outcomes)", "assets/img/shap_summary.png, survival_curve.png, optimization_allocation.png (original model outputs)", "interactive_dashboards/reducing_90_day_attrition_dashboard.html (all three charts)", "interactive_cases_refined/ninety_day_attrition_case.html and prescriptive_attrition_case.html (earlier copies)"])

# ---------------------------------------------------------------- Workforce planning
wf = FIGS["interactive_cases_refined/workforce_planning_case.html"][0]["data"]
summary_rows = [("HR", 195, "11.0%", 76, "$4,039", "5.9%"), ("Sales", 152, "14.9%", 72, "$5,346", "5.4%"), ("IT", 178, "12.8%", 56, "$6,644", "5.9%"), ("Finance", 184, "11.4%", 44, "$5,583", "4.3%"),
                ("Operations", 188, "10.7%", 89, "$6,552", "4.4%"), ("Marketing", 167, "10.4%", 43, "$5,981", "3.9%"), ("Engineering", 169, "13.1%", 42, "$7,248", "4.2%"), ("Product Development", 192, "11.1%", 60, "$5,159", "5.5%")]
wv, caps = {}, {}
colors = {"0.8": "#0f766e", "1.0": "#1e3a8a", "1.2": "#be123c"}
dash = {"0.8": "dot", "1.0": "solid", "1.2": "dash"}
for i, d in enumerate(DEPTS):
    tr = wf[i * 9:(i + 1) * 9]
    data = []
    for t in tr:
        a = t["name"].split("Attrition ")[1].split("×")[0]; h = t["name"].split("Hiring ")[1].split("×")[0]
        data.append({"type": "scatter", "mode": "lines", "name": f"Attrition {a}×, hiring {h}×", "x": list(range(13)), "y": [round(v, 1) for v in t["y"]],
                     "line": {"color": colors[a], "dash": dash[h], "width": 3 if (a, h) in (("1.0", "1.0"), ("0.8", "1.2")) else 1.6},
                     "hovertemplate": f"Attrition {a}×, hiring {h}×<br>Month %{{x}}: %{{y:.0f}}<extra></extra>"})
    base = [t for t in tr if t["name"].startswith("Attrition 1.0×, Hiring 1.0×")][0]["y"][-1]
    best = [t for t in tr if t["name"].startswith("Attrition 0.8×, Hiring 1.2×")][0]["y"][-1]
    wv[d] = {"data": data, "layout": {"xaxis": {"title": {"text": "Month"}, "dtick": 1}, "yaxis": {"title": {"text": "Projected headcount"}, "rangemode": "tozero"}, "legend": {"y": -0.3}}}
    caps[d] = f"{d}: starts at {tr[0]['y'][0]:.0f}. After 12 months the current-rates scenario ends near {base:.0f}; lower attrition with higher hiring (0.8×, 1.2×) ends near {best:.0f}, {100 * (best / base - 1):.1f}% above the current-rates path."
pages["workforce-planning"] = page(
    "workforce-planning", "Workforce Planning & Forecast", "Report · Workforce planning",
    "Twelve-month headcount scenarios by department under different attrition and hiring rates, plus a live Tableau forecast.",
    "If attrition runs a little hotter or hiring a little slower, what does headcount look like a year out? Nine scenarios per department, from today&rsquo;s numbers.",
    [("8", "departments modeled"), ("9", "attrition and hiring scenarios each"), ("12 months", "projection horizon")],
    [("scenarios", "Headcount scenarios", chart("c-wf", {"variants": wv, "captions": caps}, "Projected headcount by scenario", "On this sample, every scenario shrinks headcount over 12 months because monthly exits outpace hires at current rates. The attrition and hiring mix decides by how much: cutting attrition 20% and hiring 20% faster ends 43% to 69% above the current-rates path, depending on the department.", select=DEPTS, height=440)),
     ("today", "Where each department starts", table(["Department", "Headcount", "Attrition rate", "Time to fill (days)", "Cost per hire", "Growth target"], summary_rows, num_cols=(1, 2, 3, 4, 5))),
     ("forecast", "Demand forecast (Tableau)", '<p>A separate history-versus-forecast view of operations headcount lives on Tableau Public.</p><p><a class="btn btn--navy" href="https://public.tableau.com/views/HistoryvsForecast/Sheet3" target="_blank" rel="noopener">Open the forecast on Tableau Public <i data-lucide="arrow-up-right"></i></a></p><img src="/workforce_forecast_preview.png" width="1000" height="600" loading="lazy" alt="Line chart of operations headcount history from 2023 and a forecast through 2026, rising from about 85 to about 155" style="border-radius:12px;border:1px solid var(--line);margin-top:1rem;background:#fff">')],
    "Scenario lines and the summary table are the sample data from the original interactive page. The &ldquo;% above current rates&rdquo; figures are recomputed from those same lines and match the original page&rsquo;s numbers (it described them as &ldquo;compared to the baseline&rdquo;). The original page linked a CSV in a GitHub repo that no longer exists, so that link is gone.",
    ["interactive_cases_refined/workforce_planning_case.html (scenarios, summary table)", "workforce-forecast.html (Tableau embed)", "workforce_forecast_preview.png (forecast chart image)"])

# ---------------------------------------------------------------- Engagement impact
eng = FIGS["interactive_cases_refined/engagement_impact_case.html"]
def corr(x, y):
    mx, my = st.mean(x), st.mean(y); sx = sum((a - mx) ** 2 for a in x) ** .5; sy = sum((b - my) ** 2 for b in y) ** .5
    return sum((a - mx) * (b - my) for a, b in zip(x, y)) / (sx * sy)
ev, ecap, rs = {}, {}, {}
for t in eng[0]["data"]:
    d = t["name"]; rr = corr(t["x"], t["y"]); rs[d] = rr
    means = [round(st.mean([y for x, y in zip(t["x"], t["y"]) if x == k]), 1) for k in range(1, 6)]
    ev[d] = {"data": [{"type": "scatter", "mode": "markers", "name": d, "x": [x + ((i * 37) % 21 - 10) / 50 for i, x in enumerate(t["x"])], "y": t["y"], "marker": {"size": 6, "opacity": 0.4, "color": "#1e3a8a"},
                       "hovertemplate": "Engagement %{x:.0f}<br>Productivity %{y:.1f}<extra></extra>"},
                      {"type": "scatter", "mode": "lines+markers", "name": "Average at each score", "x": [1, 2, 3, 4, 5], "y": means, "line": {"color": "#b45309", "width": 3}, "marker": {"size": 9}}],
             "layout": {"xaxis": {"title": {"text": "Engagement score (1 to 5)"}, "dtick": 1}, "yaxis": {"title": {"text": "Productivity score"}}}}
    ecap[d] = f"{d}: {len(t['x'])} employees, correlation r = {rr:.2f}."
corr_bar = {"data": [{"type": "bar", "orientation": "h", "y": list(rs.keys()), "x": [round(v, 3) for v in rs.values()], "marker": {"color": ["#be123c" if v < -0.1 else "#94a3b8" for v in rs.values()]},
             "text": [f"{v:+.2f}" for v in rs.values()], "textposition": "outside", "cliponaxis": False, "hovertemplate": "%{y}: r = %{x:.3f}<extra></extra>"}],
            "layout": {"xaxis": {"title": {"text": "Correlation between engagement and productivity (r)"}, "range": [-0.3, 0.3], "zeroline": True}, "margin": {"l": 150}}}
tv = {}
for t in eng[1]["data"]:
    tv[t["name"]] = {"data": [{"type": "scatter", "mode": "lines+markers", "x": [f"M{m + 1}" for m in t["x"]], "y": t["y"], "line": {"color": "#0f766e", "width": 3}, "marker": {"size": 8}, "hovertemplate": "%{x}: %{y:.0%}<extra></extra>"}],
                     "layout": {"xaxis": {"title": {"text": "Month in dataset"}}, "yaxis": {"title": {"text": "Turnover rate"}, "tickformat": ".0%", "range": [0, 0.8]}}}
pages["engagement-impact"] = page(
    "engagement-impact", "Measuring Engagement Impact", "Analysis · Engagement",
    "Does engagement move productivity and turnover? A department-by-department look at the data, with the honest answer.",
    "Engagement surveys are everywhere. The question is whether the score actually moves productivity or turnover. This page lets the data answer, department by department.",
    [(f"{max(rs.values()):+.2f}", "strongest positive correlation (Marketing)"), (f"{min(rs.values()):+.2f}", "strongest negative correlation (Engineering)"), (f"{sum(len(t['x']) for t in eng[0]['data']):,}", "employee records in the sample")],
    [("productivity", "Engagement and productivity", chart("c-eng", {"variants": ev, "captions": ecap}, "Productivity by engagement score", None, select=DEPTS, height=420) +
                                                       chart("c-eng-r", corr_bar, "Correlation by department", "In this sample, engagement barely tracks productivity anywhere: every department is between &minus;0.19 and +0.07. The original page called Marketing&rsquo;s 0.07 a sign of &ldquo;noticeable productivity gains&rdquo;; the data doesn&rsquo;t support that, so the claim is gone. Engineering&rsquo;s slight negative relationship is the one worth a closer look.")),
     ("turnover", "Monthly turnover", chart("c-turn", {"variants": tv}, "Turnover rate by month", "Turnover in this synthetic sample is unrealistically high (around 50% a month), so read it for shape, not level.", select=DEPTS)),
     ("takeaway", "Takeaway", "<p>A survey score on its own is a weak lever. Pair engagement with the things it should change (manager quality, workload, growth) and test interventions, rather than assuming a higher score means higher output.</p>")],
    "Every point is from the synthetic sample embedded in the original interactive page. Correlations are recomputed from those points; the original page only quoted Marketing&rsquo;s figure (0.07), which matches.",
    ["interactive_cases_refined/engagement_impact_case.html (employee-level sample, monthly turnover)"])

# ---------------------------------------------------------------- Diversity metrics
dv = FIGS["diversity_dashboard_final.html"]
dvars = {}
for f, label in zip(dv, ["Race", "Job level", "Gender"]):
    data = [{"type": "bar", "orientation": "h", "name": t["name"], "y": t["y"], "x": t["x"], "hovertemplate": t["name"] + ": %{x}<extra>%{y}</extra>"} for t in f["data"]]
    dvars[label] = {"data": data, "layout": {"barmode": "stack", "xaxis": {"title": {"text": "Employees"}}, "margin": {"l": 110}, "legend": {"y": -0.25}}}
pct_rows = []
g = dv[2]["data"]
for i, d in enumerate(g[0]["y"]):
    tot = sum(t["x"][i] for t in g)
    pct_rows.append((d, tot) + tuple(f"{100 * t['x'][i] / tot:.0f}%" for t in g))
pages["diversity-metrics"] = page(
    "diversity-metrics", "Diversity Metrics", "Report · Workforce composition",
    "Representation by department across race, gender and job level, in one consistent view.",
    "Executives needed one view of representation instead of three spreadsheets. Switch between race, gender and job level to see each department&rsquo;s makeup.",
    [("6", "departments"), ("3", "lenses: race, gender, job level"), (f"{sum(sum(t['x']) for t in g):,}", "employees in the sample")],
    [("composition", "Composition by department", chart("c-div", {"variants": dvars}, "Employees by department", None, select=list(dvars.keys()), height=420)),
     ("gender", "Gender share by department", table(["Department", "Employees", "Female", "Male", "Non-binary"], pct_rows, num_cols=(1, 2, 3, 4)))],
    "All counts come from the synthetic sample in the original dashboard. Gender shares are computed from those counts.",
    ["diversity_dashboard_final.html (three charts)", "diversity-metrics.html (wrapper page)"])

# ---------------------------------------------------------------- HR attrition
hr = dict(n=200, attr=46, cur=154, rate=0.23,
          dept={"Finance": 32, "Engineering": 30, "HR": 27, "Marketing": 26, "Sales": 22, "Operations": 17},
          trend={"2020-12": 1, "2021-01": 1, "2021-07": 2, "2022-05": 1, "2022-08": 1, "2023-01": 2, "2023-02": 1, "2023-03": 1, "2023-04": 1, "2023-05": 1, "2023-06": 1, "2023-07": 2, "2023-08": 2, "2023-12": 1, "2024-01": 1, "2024-04": 1, "2024-05": 1, "2024-06": 1, "2024-07": 1, "2024-08": 2, "2024-09": 1, "2024-12": 2, "2025-01": 5, "2025-02": 1, "2025-05": 6, "2025-06": 1, "2025-07": 5},
          heat={"<25": {"Engineering": 84.65, "Finance": 72.81, "HR": 75.90, "Marketing": 74.77, "Operations": 98.42, "Sales": 80.14},
                "25-34": {"Engineering": 66.27, "Finance": 81.66, "HR": 64.45, "Marketing": 70.86, "Operations": 75.85, "Sales": 64.74},
                "35-44": {"Engineering": 79.04, "Finance": 74.07, "HR": 85.31, "Marketing": 83.60, "Operations": 78.69, "Sales": 72.70},
                "45-54": {"Engineering": 75.95, "Finance": 77.52, "HR": 72.40, "Marketing": 78.35, "Operations": 72.69, "Sales": 74.12},
                "55+": {"Engineering": 77.78, "Finance": 76.66, "HR": 72.16, "Marketing": 70.99, "Operations": 70.84, "Sales": 81.60}},
          recent=[("E0042", "Finance", "Sales Executive", "2025-07-31", 1.10), ("E0015", "Finance", "Sales Executive", "2025-07-26", 5.69), ("E0163", "Operations", "Research Scientist", "2025-07-17", 4.91),
                  ("E0134", "Finance", "Human Resources", "2025-07-11", 0.79), ("E0123", "Marketing", "Research Director", "2025-07-05", 0.62), ("E0020", "Finance", "Research Director", "2025-06-13", 0.24),
                  ("E0076", "Engineering", "Laboratory Technician", "2025-05-30", 0.32), ("E0046", "Sales", "Healthcare Representative", "2025-05-26", 0.98), ("E0083", "Marketing", "Healthcare Representative", "2025-05-26", 1.20),
                  ("E0071", "HR", "Research Scientist", "2025-05-20", 0.38)])
hr_trend = {"data": [{"type": "bar", "x": list(hr["trend"].keys()), "y": list(hr["trend"].values()), "marker": {"color": "#1e3a8a"}, "hovertemplate": "%{x}: %{y} exits<extra></extra>"}],
            "layout": {"xaxis": {"title": {"text": "Month"}, "type": "category", "tickangle": -45}, "yaxis": {"title": {"text": "Exits"}, "dtick": 1}}}
hr_dept = {"data": [{"type": "bar", "orientation": "h", "y": list(hr["dept"].keys())[::-1], "x": list(hr["dept"].values())[::-1], "marker": {"color": "#0f766e"}, "text": list(hr["dept"].values())[::-1], "textposition": "outside", "cliponaxis": False}],
           "layout": {"xaxis": {"title": {"text": "Employees"}}, "margin": {"l": 110}}}
ages = list(hr["heat"].keys()); hd = list(hr["heat"]["<25"].keys())
hr_heat = {"data": [{"type": "heatmap", "x": hd, "y": ages, "z": [[hr["heat"][a][d] for d in hd] for a in ages], "colorscale": [[0, "#fef3c7"], [0.5, "#5eead4"], [1, "#134e4a"]],
            "text": [[f"{hr['heat'][a][d]:.0f}" for d in hd] for a in ages], "texttemplate": "%{text}", "hovertemplate": "%{y}, %{x}: %{z:.1f}<extra></extra>", "colorbar": {"title": {"text": "Score"}}}],
           "layout": {"xaxis": {"title": {"text": "Department"}}, "yaxis": {"title": {"text": "Age band"}}, "margin": {"b": 70}}}
pages["hr-attrition"] = page(
    "hr-attrition", "HR Attrition Dashboard", "Report · Attrition",
    "Attrition rate, who left and when, and where satisfaction is lowest by age band and department.",
    "A one-screen view for an HR team: how many people left, when exits clustered, and which age bands and departments report the lowest satisfaction.",
    [("23%", "attrition rate"), ("46", "exits"), ("154", "current employees")],
    [("when", "When people left", chart("c-hr-trend", hr_trend, "Exits by month", "Exits cluster in 2025 (January, May and July account for 16 of 46), which is where a stay-interview program would start.")),
     ("where", "Where", chart("c-hr-dept", hr_dept, "Employees by department") + chart("c-hr-heat", hr_heat, "Satisfaction by age band and department", "The 25 to 34 band in HR (64) and Sales (65) and Engineering (66) is the lowest-satisfaction pocket.", height=380)),
     ("recent", "Most recent exits", table(["Employee", "Department", "Role", "Exit date", "Tenure (years)"], hr["recent"], num_cols=(4,)))],
    "All values are the summary data embedded in the original dashboard, which was calculated from a synthetic 200-person dataset. Employee IDs are fictitious.",
    ["hr_attrition_dashboard_lite.html (embedded summary data)"])

# ---------------------------------------------------------------- AI support analytics
ai = {k: FIGS[k][0]["data"] for k in ["dashboard_intent_distribution.html", "dashboard_resolution_rate.html", "dashboard_satisfaction.html", "dashboard_model_performance.html"]}
intents = [t["name"] for t in ai["dashboard_intent_distribution.html"]]
cnt = [t["y"][0] for t in ai["dashboard_intent_distribution.html"]]
res = [t["y"][0] for t in ai["dashboard_resolution_rate.html"]]
sat = [t["y"][0] for t in ai["dashboard_satisfaction.html"]]
order = sorted(range(len(intents)), key=lambda i: -cnt[i])
ints = [intents[i] for i in order]
c_int = {"data": [{"type": "bar", "x": ints, "y": [cnt[i] for i in order], "marker": {"color": "#1e3a8a"}, "text": [cnt[i] for i in order], "textposition": "outside", "cliponaxis": False, "hovertemplate": "%{x}: %{y} conversations<extra></extra>"}],
         "layout": {"yaxis": {"title": {"text": "Conversations"}, "rangemode": "tozero"}, "xaxis": {"title": {"text": "Intent"}}}}
c_res = {"data": [{"type": "bar", "x": ints, "y": [res[i] for i in order], "marker": {"color": ["#be123c" if res[i] < 0.72 else "#0f766e" for i in order]}, "text": [f"{res[i]:.0%}" for i in order], "textposition": "outside", "cliponaxis": False, "hovertemplate": "%{x}: %{y:.1%}<extra></extra>"}],
         "layout": {"yaxis": {"title": {"text": "Resolved without a human"}, "tickformat": ".0%", "range": [0, 1]}, "xaxis": {"title": {"text": "Intent"}}}}
c_sat = {"data": [{"type": "bar", "x": ints, "y": [sat[i] for i in order], "marker": {"color": "#0369a1"}, "text": [f"{sat[i]:.2f}" for i in order], "textposition": "outside", "cliponaxis": False, "hovertemplate": "%{x}: %{y:.2f} / 5<extra></extra>"}],
         "layout": {"yaxis": {"title": {"text": "Average satisfaction (1 to 5)"}, "range": [1, 5]}, "xaxis": {"title": {"text": "Intent"}}}}
mp = ai["dashboard_model_performance.html"]
c_mod = {"data": [{"type": "scatter", "mode": "lines+markers", "name": t["name"], "x": t["x"], "y": [round(v, 3) for v in t["y"]], "line": {"width": 3, "dash": "dot" if "Misclass" in t["name"] else "solid"}, "marker": {"size": 8}} for t in mp],
         "layout": {"yaxis": {"title": {"text": "Score / rate"}, "range": [0, 1]}, "xaxis": {"title": {"text": "Model version"}}}}
tot = sum(cnt)
lo = intents[res.index(min(res))]
pages["ai-support-analytics"] = page(
    "ai-support-analytics", "AI Support Analytics", "Report · AI assistant performance",
    "What customers ask an AI support assistant, how often it resolves the issue, how they rate it, and how the model improved across versions.",
    "Four questions every team running an AI assistant should be able to answer: what are people asking, does it actually resolve them, are they satisfied, and is the model getting better?",
    [(f"{tot}", "conversations in the sample"), (f"{sum(c * r_ for c, r_ in zip(cnt, res)) / tot:.0%}", "resolved overall"), (f"{mp[2]['y'][-1]:.2f}", f"F1 score at v1.5, up from {mp[2]['y'][0]:.2f}")],
    [("intents", "What people ask about", chart("c-int", c_int, "Conversations by intent", f"Order Status is the single largest intent ({cnt[intents.index('Order Status')]} of {tot}), so it is the first place to invest in self-service.")),
     ("resolution", "Resolution rate", chart("c-res", c_res, "Share of conversations resolved by intent", f"&ldquo;{lo}&rdquo; resolves least often ({min(res):.0%}). Order Status, the biggest bucket, also sits below average at {res[intents.index('Order Status')]:.0%}.")),
     ("satisfaction", "Satisfaction", chart("c-sat", c_sat, "Average satisfaction by intent", "Scores cluster near 3 out of 5 for every intent, with &ldquo;Other&rdquo; lowest. There is no intent where the assistant clearly delights.")),
     ("model", "Model performance", chart("c-mod", c_mod, "Precision, recall, F1 and misclassification by version", f"Across six versions F1 rose from {mp[2]['y'][0]:.2f} to {mp[2]['y'][-1]:.2f} and misclassification fell from {mp[3]['y'][0]:.0%} to {mp[3]['y'][-1]:.0%}."))],
    "Values come from the four full Plotly dashboards on the old site (dashboard_*.html), which were generated from the underlying sample conversation log; resolution and satisfaction are averages per intent from that log. The old site also had smaller hand-typed versions of these charts with different numbers; those were not used because they did not match the generated dashboards.",
    ["dashboard_intent_distribution.html", "dashboard_resolution_rate.html", "dashboard_satisfaction.html", "dashboard_model_performance.html", "interactive_cases_refined/*_case.html (earlier hand-typed copies, superseded)"])

# ---------------------------------------------------------------- write + cross-links
for slug, htmltext in pages.items():
    others = [s for s in ALL if s != slug]
    i0 = list(ALL).index(slug)
    others = (others[i0:] + others[:i0])[:3]
    more = "".join(f'<a class="card" href="/reports/{s}.html"><div class="card__body"><span class="card__kicker">{ALL[s][1]}</span><h4>{ALL[s][0]}</h4><p>{esc(ALL[s][2])}</p><span class="card__foot">Open report <i data-lucide="arrow-right"></i></span></div></a>' for s in others)
    (OUT / f"{slug}.html").write_text(htmltext.replace(f"__MORE_{slug}__", more))
    print("wrote", slug)
