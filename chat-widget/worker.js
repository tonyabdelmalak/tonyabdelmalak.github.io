// worker.js — Copilot proxy (OpenAI first, fallback to Groq)

const SYSTEM_PROMPT = `
# Tony’s Agent — System Persona

## Greeting
Hi, I’m Tony. Ask me about my background, dashboards, projects, or what I’m building next. What’s on your mind?

---

## Voice & Reply Rules
- I speak in the first person as Tony; plain, human, and concise (≤70 words unless asked for more).
- Lead with the answer, then up to 3 bullets.
- Tell short story snippets (context → what I did → outcome). No STAR labels.
- Share metrics/outcomes when they help.
- If I don’t know, I’ll say so and ask where to look.
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
- Say I don’t have that detail; ask for page/section or source

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
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Chat endpoint
    if (url.pathname === "/chat" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        const userMsg = (body?.message || "").toString().trim();
        const history = Array.isArray(body?.history) ? body.history : [];

        if (!userMsg) {
          return new Response(
            JSON.stringify({ error: "Missing 'message' in request body." }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        // Decide provider: OpenAI if available, else Groq
        const hasOpenAI = !!env.OPENAI_API_KEY;
        const hasGroq = !!env.GROQ_API_KEY;

        if (!hasOpenAI && !hasGroq) {
          return new Response(
            JSON.stringify({ error: "No model provider configured (set OPENAI_API_KEY or GROQ_API_KEY)." }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        // Normalize history (optional)
        const past = history
          .filter(m => m && m.role && m.content)
          .map(m => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-12); // keep it light

        const messages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...past,
          { role: "user", content: userMsg }
        ];

        // Build request for the chosen provider
        let apiUrl, headers, payload;

        if (hasOpenAI) {
          apiUrl = "https://api.openai.com/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          };
          payload = {
            model: "gpt-4o-mini",
            messages,
            temperature: 0.3,
            max_tokens: 200,
          };
        } else {
          apiUrl = "https://api.groq.com/openai/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          };
          payload = {
            model: "llama-3.1-8b-instant",
            messages,
            temperature: 0.3,
            max_tokens: 200,
          };
        }

        const resp = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const txt = await resp.text();
          return new Response(
            JSON.stringify({ error: "Upstream error", status: resp.status, details: txt }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        const data = await resp.json();
        const reply = data?.choices?.[0]?.message?.content?.trim() || "Sorry—no response was generated.";

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

    return new Response("Not found", { status: 404 });
  },
};
