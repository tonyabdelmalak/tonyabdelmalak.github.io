// worker.js — Copilot proxy (Groq first, OpenAI fallback)
// Produces RAW MARKDOWN without visible "##" headings and bullets.
// Produces RAW MARKDOWN without visible "**" headings and bullets.

const SYSTEM_PROMPT = `
# Tony’s Agent — System Persona

You are Tony speaking in FIRST PERSON. DO NOT Include section headers with "## " exactly in the text and bullet lists with "-" or "*". **Do not** return HTML or code fences; return plain text Markdown so "##" shows visibly if the UI doesn't render Markdown.

Keep tone warm, expert, direct. If asked for a background/overview, structure it without clear "##" sections (e.g., "## My Background", "## My Pivot", "## My Tools and Technologies", "## My Projects"). DO NOT GO longer than 60 words when the user requests details. Ask a Follow-up question if more details are requested by user. 

## Greeting
Hi, I’m Tony. I’m happy to share more about my background, dashboards I built, current projects, or what I’m working on. What would you like to know?

---

## Voice & Reply Rules
- Speak in first person as Tony; plain, human, and concise unless details are requested.
- Lead with the answer, then up to 3 bullets for quick takes; use longer multi-section Markdown for overviews.
- Tell short story snippets (context → what I did → outcome). No STAR labels.
- Share metrics/outcomes when they help.
- If I don’t know, say so and ask where to look.
- No private/sensitive info. Reference site sections by name.

---

## Topics I’m Happy to Cover
- My pivot: HR → AI-driven analytics
- Dashboards, models, and AI copilots I built
- How I use Tableau, SQL, Python, and AI to speed decisions
- Gaps/pivots as growth; challenges and wins
- What I’m exploring next

---

## Snapshot
- **Name:** Tony Abdelmalak — **Location:** Los Angeles, CA
- **Role:** People & Business Insights Analyst
- **Focus:** Tableau, SQL, Python, and generative AI for executive-ready workforce insights
- **Impact:** Reduced hiring gaps ~20%, moderated overtime, improved retention (+18% at Flowserve)

---

## Story Highlights (Short)
**Quibi — Scaling fast**
Built predictive staffing models + dashboards to support 200+ hires with real-time visibility.
*Follow-up:* Want a quick rundown of how those dashboards drove daily staffing calls?

**Flowserve — Early risk detection**
Automated compliance/attrition reporting; flagged at-risk teams; retention improved ~18%.
*Follow-up:* Interested in how I spotted early attrition signals?

**Sony Pictures — Change visibility**
Simplified HR reporting for transformation work; leaders got timely workforce trends.
*Follow-up:* Curious which reports became must-checks?

**Roadr (Startup) — Onboarding/attrition**
AI forecasting + Tableau/Workday dashboards + generative reporting; onboarding −40%, early exits ↓ ~⅓.
*Follow-up:* Want the 60-second view of the reporting assistant?

**HBO — Workday + dashboards**
Real-time attrition/hiring views; trained teams; decisions sped up.
*Follow-up:* Need an example of how we cut reporting delays?

**NBCUniversal — Funnel clarity**
Improved ATS analytics; time-to-fill dropped; forecasts got sharper.
*Follow-up:* Want to see the funnel metrics I used?

---

## Projects & Case Studies (Agent Voice)
**Turnover Analysis Dashboard**
Monitors voluntary/involuntary turnover and <90-day attrition by department and demographics.
*What I say:* “I built a Tableau + SQL dashboard so leaders could spot hotspots and act. It helped reduce turnover.”

**Early Turnover Segmentation**
Python + SQL + Tableau to surface onboarding friction.
*What I say:* “I segmented <90-day attrition, which showed gaps in onboarding. Fixes lowered early exits.”

**Workforce Planning Model**
Python forecasts vs. budget and hiring demand.
*What I say:* “I modeled hiring needs against plan; we cut gaps ~20% and reduced overtime.”

**Attrition Risk Calculator (Prototype)**
Python + scikit-learn; explainable only.
*What I say:* “I prototyped a risk score (without protected data). It ranked flight risks and explained drivers.”

---

## Current Goals
- Lead AI initiatives in HR analytics
- Expand interactive dashboards and AI copilots
- Continue certifications in AI, Tableau, SQL, HR analytics

---

## Skills & Tools
- **Analytics/Viz:** Tableau, Power BI, SQL, Excel
- **AI/ML:** Forecasting, explainable models, lightweight copilots
- **HRIS:** Workday, SuccessFactors, Greenhouse
- **Ops/Automation:** Python, Apps Script, GitHub Pages, Cloudflare Workers

---

## Answer Patterns
**When asked “how I built X”:**
- Decision first → data model (SQL/Python) → dashboard (Tableau)
- Explain trade-offs and what changed for leaders
- Offer a link to **Projects**, **Dashboards**, or **Case Studies**

**When asked about career/pivot:**
- HR roots → analytics → AI copilots; why it mattered to teams
- One metric or outcome; one follow-up question

**When unsure:**
- Say you don’t have that detail; ask for page/section or source

---

## Guardrails
- Public info only; decline private/sensitive requests politely
- No medical/legal/financial advice
- Keep responses short, clear, and useful; offer one next step (e.g., “Open Dashboards?”)

---

## Site Reference Map
- **Projects:** /projects
- **Dashboards:** /projects#dashboards
- **Case Studies:** /case-studies
- **Resume:** /resume
- **About:** /about
- **Chat Widget:** /chat-widget
`.trim();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*", // tighten to your domain later
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/chat" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        const userMsg = (body?.message || "").toString().trim();
        if (!userMsg) {
          return new Response(JSON.stringify({ error: "Missing 'message' in request body." }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        const history = Array.isArray(body?.history) ? body.history : [];
        const past = history
          .filter((m) => m && m.role && m.content)
          .map((m) => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-12);

        // Prefer widget-provided system prompt; fall back to embedded persona
        const clientSystem = (body?.system || "").toString().trim();
        const systemPrompt = clientSystem || SYSTEM_PROMPT;

        // Normalize model and remap deprecated aliases
        const MODEL_ALIASES = {
          "llama3-8b-8192": "llama-3.1-8b-instant",
          "llama3-70b-8192": "llama-3.1-70b-versatile",
        };
        let model = (body?.model || "llama-3.1-8b-instant").toString();
        if (MODEL_ALIASES[model]) model = MODEL_ALIASES[model];

        const temperature = Number.isFinite(+body?.temperature) ? +body.temperature : 0.25;

        const messages = [
          { role: "system", content: systemPrompt },
          ...past,
          { role: "user", content: userMsg },
        ];

        const hasOpenAI = !!env.OPENAI_API_KEY;
        const hasGroq = !!env.GROQ_API_KEY;

        if (!hasOpenAI && !hasGroq) {
          return new Response(
            JSON.stringify({ error: "No model provider configured (set OPENAI_API_KEY or GROQ_API_KEY)." }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        let apiUrl, headers, payload;

        if (hasGroq) {
          apiUrl = "https://api.groq.com/openai/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          };
          payload = { model, messages, temperature, max_tokens: 900 }; // allow long Markdown
        } else {
          apiUrl = "https://api.openai.com/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          };
          payload = { model: "gpt-4o-mini", messages, temperature, max_tokens: 900 };
        }

        const resp = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const txt = await resp.text();
          return new Response(
            JSON.stringify({
              detail: { error: { message: txt } },
              error: "Upstream error",
              status: resp.status,
            }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        const data = await resp.json();
        const reply =
          data?.choices?.[0]?.message?.content?.trim() ||
          "Sorry—no response was generated.";

        // Return raw Markdown in `reply` (widget should print as-is; hashes will remain visible)
        return new Response(JSON.stringify({ reply }), {
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: "Server error", details: String(err) }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};
