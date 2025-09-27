// worker.js — Tony’s Copilot (Groq first, OpenAI fallback)
// Short, conversational replies for broad career/pivot/experience/projects/resume/dashboards asks.
// Plain-text output (no headings/emphasis), strips boilerplate, clamps to a single friendly sentence + follow-up.

const SYSTEM_PROMPT = `
# Tony’s Agent — System Persona

// ## Greeting
Hi, I’m Tony. Ask me about my background, dashboards, projects, or what I’m currently working on.

// ## Voice & Reply Rules
- I speak in the first person as Tony; plain, human, and concise (≤60 words unless asked for more).
- Lead with the answer, then up to 3 bullets.
- Tell short story snippets (context → what I did → outcome). No STAR labels.
- Share metrics/outcomes when they help.
- If I don’t know, I’ll say so and ask where to look.
- No private/sensitive info. Reference site sections by name.

// ## Topics I’m Happy to Cover
- My pivot: HR → AI-driven analytics
- Dashboards, models, and AI copilots I built
- How I use Tableau, SQL, Python, and AI to speed decisions
- Gaps/pivots as growth; challenges and wins
- What I’m exploring next

// ## Snapshot
- Name: Tony Abdelmalak — Location: Los Angeles, CA
- Role: People & Business Insights Analyst
- Focus: Tableau, SQL, Python, and generative AI for executive-ready workforce insights
- Impact: Reduced hiring gaps ~20%, moderated overtime, improved retention (+18% at Flowserve)

// ## Story Highlights (Short)
Quibi — Scaling fast: Predictive staffing models + dashboards for 200+ hires.
Flowserve — Early risk detection: Automated compliance/attrition reporting; retention improved ~18%.
Sony Pictures — Change visibility: Simplified HR reporting during transformation.
Roadr (Startup) — Onboarding/attrition: AI forecasting + Tableau/Workday dashboards; onboarding time −40%, early exits ↓ ~1/3.
HBO — Workday + dashboards: Real-time attrition/hiring views; trained teams; decisions sped up.
NBCUniversal — Funnel clarity: Improved ATS analytics; time-to-fill dropped; forecasts sharper.

## Projects & Case Studies (Agent Voice)
Turnover Analysis Dashboard: Tableau+SQL to spot hotspots and act.
Early Turnover Segmentation: Python+SQL+Tableau to surface onboarding friction.
Workforce Planning Model: Python forecasts vs. budget and demand.
Attrition Risk Calculator (Prototype): Explainable scoring (no protected data).

## Current Goals
- Lead AI initiatives in HR analytics
- Expand interactive dashboards and AI copilots
- Continue certifications in AI, Tableau, SQL, HR analytics

## Skills & Tools
- Analytics/Viz: Tableau, Power BI, SQL, Excel
- AI/ML: Forecasting, explainable models, lightweight copilots
- HRIS: Workday, SuccessFactors, Greenhouse
- Ops/Automation: Python, Apps Script, GitHub Pages, Cloudflare Workers

## Answer Patterns
When asked “how I built X”: Decision first → data model (SQL/Python) → dashboard (Tableau) → impact.
When asked about career/pivot: HR roots → analytics → AI copilots; why it mattered; one metric; one follow-up.
When unsure: say so; ask where to look; offer next step.

## Guardrails
- Public info only; decline private/sensitive requests politely
- No medical/legal/financial advice
- Keep responses short, clear, and useful; offer one next step (e.g., “Open Dashboards?”)

## Site Reference Map
Projects: /projects | Dashboards: /projects#dashboards | Case Studies: /case-studies | Resume: /resume | About: /about | Chat Widget: /chat-widget
`.trim();

// Extra directive applied only to broad, non-specific asks across career topics
const CONCISE_DIRECTIVE = `
User is asking broadly about Tony's career (journey, pivot to AI-driven analytics, past experience/employers,
resume, current projects, accomplishments/impact, dashboards). Reply in <= 60 words as ONE conversational sentence
that names 3–4 representative items relevant to the ask, then end with exactly ONE short follow-up question.
No bullets. No headings. No “What I did/Outcome/Follow-up/What I say” boilerplate.
`.trim();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}
function cors() { return { "Content-Type": "application/json", ...corsHeaders() }; }

// Detect broad/non-specific asks across ALL career topics
function isBroadCareerAsk(t = "") {
  const s = t.toLowerCase();
  const domainHit = /(project|projects|dashboard|dashboards|career|journey|pivot|resume|experience|employment|work history|accomplish|impact)\b/.test(s);
  if (!domainHit) return false;
  const specifics = [
    "turnover","attrition","workforce","funnel","recruit","forecast","risk","tableau","sql","python","workday","power bi",
    "greenhouse","successfactors",
    "quibi","flowserve","sony","hbo","nbcuniversal","roadr",
    "open","link","url","show","see","download","pdf",
    "percent","%","hours","time to fill","time-to-fill","headcount","ramp","overtime"
  ];
  return !specifics.some(k => s.includes(k));
}

// Scrub: plain text; remove boilerplate; normalize (no headings/emphasis)
function scrubMarkdown(t = "") {
  if (!t) return "";
  t = t.replace(/\r\n/g, "\n");
  t = t.replace(/\bWhat I say:\s*[“"][\s\S]*?[”"](?:\n|$)/g, "");
  t = t.replace(/\bWhat I say:.*(?:\n|$)/g, "");
  t = t.replace(/^\s*-\s*What I did:.*(?:\n|$)/gmi, "");
  t = t.replace(/^\s*-\s*Outcome:.*(?:\n|$)/gmi, "");
  t = t.replace(/^\s*-\s*Follow-up:.*(?:\n|$)/gmi, "");
  t = t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/_(.*?)_/g, "$1");
  t = t.replace(/^\s*\+\s+/gm, "- ").replace(/^\s*\*\s+/gm, "- ");
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, "").replace(/^\s*>\s?/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.split("\n").map(l => l.replace(/[ \t]+$/g, "")).join("\n");
  return t.trim();
}

// Extract key project names from verbose output
function itemsFromText(t = "") {
  const lines = t.split("\n");
  let candidates = lines
    .map(l => l.replace(/^[-*•]\s*/, "").trim())
    .filter(l =>
      /(dashboard|model|segmentation|calculator|forecast|report|planning|analysis|attrition|turnover|staffing|onboarding)/i.test(l)
    );

  // fallback: title-ish lines
  if (!candidates.length) {
    candidates = lines
      .map(l => l.trim())
      .filter(l => l && /^[A-Z][^:]{2,80}$/.test(l));
  }

  const seen = new Set();
  const cleaned = [];
  for (let c of candidates) {
    c = c.split(":")[0].split(".")[0].trim();
    c = c.replace(/[\u2013\u2014]/g, "-").replace(/\s{2,}/g, " ").replace(/\.$/, "");
    if (c && !seen.has(c.toLowerCase())) {
      seen.add(c.toLowerCase());
      cleaned.push(c);
    }
  }
  return cleaned.slice(0, 4);
}

function toOneSentence(items) {
  if (!items.length) return "";
  if (items.length === 1) return `I've worked on ${items[0]}. Want me to dive into that?`;
  const last = items.pop();
  return `I've worked on ${items.join(", ")}, and ${last}. Which one should I expand on?`;
}

// Force concise style for broad asks
function enforceBroadStyle(text, isBroad) {
  if (!isBroad) return text;

  const items = itemsFromText(text);
  if (items.length) return toOneSentence(items);

  const firstSentence = (text.split(/(?<=\.)\s+/)[0] || text).slice(0, 200).replace(/^[-*•]\s*/, "");
  return `I've worked on things like ${firstSentence}. Which area would you like me to expand on?`;
}

// Optional: strip obviously unknown employer names if they sneak in (defensive)
function scrubUnknownEmployers(t = "") {
  const known = ["quibi", "flowserve", "sony", "hbo", "nbcuniversal", "roadr"];
  const bads = ["disney", "netflix", "warner bros", "warner brothers", "hulu", "amazon", "meta"];
  const lower = t.toLowerCase();
  const hasKnown = known.some(k => lower.includes(k));
  const hasBad = bads.some(b => lower.includes(b));
  return hasBad && !hasKnown ? t.replace(/\b(Disney|Netflix|Warner Bros\.?|Warner Brothers|Hulu|Amazon|Meta)\b/gi, "—") : t;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // health + CORS
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), { headers: cors() });
    }
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

    // chat
    if (url.pathname === "/chat" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        const userMsg = (body?.message || "").toString().trim();
        if (!userMsg) {
          return new Response(JSON.stringify({ error: "Missing 'message' in request body." }), { status: 400, headers: cors() });
        }

        const history = Array.isArray(body?.history) ? body.history : [];
        const past = history
          .filter(m => m?.role && m?.content)
          .map(m => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-12);

        // prefer client system; fallback to persona above
        const clientSystem = (body?.system || "").toString().trim();
        const systemPrompt = clientSystem || SYSTEM_PROMPT;

        const broad = isBroadCareerAsk(userMsg);
        const pre = broad ? [{ role: "system", content: CONCISE_DIRECTIVE }] : [];
        const messages = [{ role: "system", content: systemPrompt }, ...pre, ...past, { role: "user", content: userMsg }];

        // model selection
        const ALIAS = { "llama3-8b-8192": "llama-3.1-8b-instant", "llama3-70b-8192": "llama-3.1-70b-versatile" };
        let model = (body?.model || "llama-3.1-8b-instant").toString();
        if (ALIAS[model]) model = ALIAS[model];

        const temperature = Number.isFinite(+body?.temperature) ? +body.temperature : (broad ? 0.2 : 0.25);
        const maxTokens  = broad ? 220 : 900;

        // providers
        const hasOpenAI = !!env.OPENAI_API_KEY;
        const hasGroq   = !!env.GROQ_API_KEY;
        if (!hasOpenAI && !hasGroq) {
          return new Response(JSON.stringify({ error: "No model provider configured (set OPENAI_API_KEY or GROQ_API_KEY)." }), { status: 500, headers: cors() });
        }

        let apiUrl, headers, payload;
        if (hasGroq) {
          apiUrl = "https://api.groq.com/openai/v1/chat/completions";
          headers = { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" };
          payload = { model, messages, temperature, max_tokens: maxTokens };
        } else {
          apiUrl = "https://api.openai.com/v1/chat/completions";
          headers = { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" };
          payload = { model: "gpt-4o-mini", messages, temperature, max_tokens: maxTokens };
        }

        const resp = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify(payload) });
        if (!resp.ok) {
          const txt = await resp.text();
          return new Response(JSON.stringify({ error: "Upstream error", detail: txt }), { status: 502, headers: cors() });
        }

        const data  = await resp.json();
        const raw   = data?.choices?.[0]?.message?.content?.trim() || "Sorry—no response was generated.";
        const clean = scrubUnknownEmployers(enforceBroadStyle(scrubMarkdown(raw), broad));
        return new Response(JSON.stringify({ reply: clean }), { headers: cors() });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Server error", details: String(err) }), { status: 500, headers: cors() });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};
