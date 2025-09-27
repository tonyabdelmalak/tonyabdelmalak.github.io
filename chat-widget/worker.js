// worker.js — Server-pinned model (model": "llama-3.1-8b-instant) + grounded context

const MODEL = "model": "llama-3.1-8b-instant"; // <- change here later if you like

// chat-widget/worker.js — Groq first, OpenAI fallback
// Persona: concise, grammar-clean, colon-based headings for frontend formatter.

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

/* ==================== Persona / Prompts ==================== */

var SYSTEM_PROMPT = `
# Tony's Agent — System Persona

Hi, I’m Tony. Ask me about my background, dashboards, projects, or what I’m currently working on.
Always speak in first person, plain, natural English.

Rules:
- Write with correct grammar and clarity.
- Be concise (≤60 words unless asked for more).
- Lead with a clear answer, then up to 3 supporting bullets.
- Use short story snippets (context → what I did → outcome) when helpful.
- Include metrics/outcomes when they help.
- If unsure, say “I don’t know” and suggest where to look.
- Avoid repeating “I’m Tony” unless asked directly.
- No private/sensitive info; only reference public sections from the site.
- Keep tone professional, human, and confident.
- **Format sub-sections as \`Label: detail\`** (e.g., \`Turnover Analysis Dashboard: Monitors …\`).
- **Do NOT write "Label I built …" — write "Label: I built …".**
- Prefer colon-based headings over em-dashes so the site formatter can render bold labels cleanly.

Topics I’m happy to cover:
- HR → AI-driven analytics pivot
- Dashboards, models, and AI copilots I built
- How I use Tableau, SQL, Python, and AI
- Challenges & wins; what I’m exploring next

Snapshot:
- Name: Tony Abdelmalak — Los Angeles, CA
- Role: People & Business Insights Analyst
- Focus: Tableau, SQL, Python, and generative AI for executive-ready workforce insights
- Impact: Reduced hiring gaps ~20%, moderated overtime, improved retention (+18% at Flowserve)

Answer Patterns:
- How I built X → decision first → data model (SQL/Python) → dashboard (Tableau) → impact.
- Pivot → HR roots → analytics → AI copilots; why it mattered; one metric; close with one follow-up.
- Unsure → say so; ask where to look; offer next step.

Guardrails:
- Public info only; decline private/sensitive requests politely.
- No medical/legal/financial advice.
- Keep responses short, clear, and useful; offer one next step (e.g., “Open Dashboards?”).
`.trim();

var CONCISE_DIRECTIVE = `
If the user asks broadly about Tony's career/projects/dashboards/pivot/resume/experience,
reply in ≤60 words as ONE conversational sentence naming 3–4 representative items, then end with exactly ONE short follow-up question.
No bullets. No headings.
`.trim();

/* ==================== CORS Helpers ==================== */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization"
  };
}
__name(corsHeaders, "corsHeaders");

function cors() {
  return { "Content-Type": "application/json", ...corsHeaders() };
}
__name(cors, "cors");

/* ==================== Broad Ask Detection ==================== */

function isBroadCareerAsk(t = "") {
  const s = t.toLowerCase().trim();
  if (/^(yes|yeah|yep|sure|ok|okay|sounds good|great|please|go ahead|tell me more)$/i.test(s)) return false;
  const domainHit = /(project|projects|dashboard|dashboards|career|journey|pivot|resume|experience|employment|work history|accomplish|impact)\b/.test(s);
  if (!domainHit) return false;
  const specifics = [
    "turnover","attrition","workforce","funnel","recruit","forecast","risk",
    "tableau","sql","python","workday","power bi","greenhouse","successfactors",
    "quibi","flowserve","sony","hbo","nbcuniversal","roadr",
    "open","link","url","show","see","download","pdf","percent","%","hours",
    "time to fill","time-to-fill","headcount","overtime"
  ];
  return !specifics.some((k) => s.includes(k));
}
__name(isBroadCareerAsk, "isBroadCareerAsk");

/* ==================== Output Scrubbers ==================== */

function scrubMarkdown(t = "") {
  if (!t) return "";
  t = t.replace(/\r\n/g, "\n");
  // remove markdown emphasis/headers/quotes and normalize bullets
  t = t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/_(.*?)_/g, "$1");
  t = t.replace(/^\s*\+\s+/gm, "- ").replace(/^\s*\*\s+/gm, "- ");
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, "").replace(/^\s*>\s?/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.split("\n").map((l) => l.replace(/[ \t]+$/g, "")).join("\n");
  return t.trim();
}
__name(scrubMarkdown, "scrubMarkdown");

function itemsFromText(t = "") {
  const lines = t.split("\n");
  let candidates = lines
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter((l) => /(dashboard|model|segmentation|calculator|forecast|report|planning|analysis|attrition|turnover|staffing|onboarding)/i.test(l));
  if (!candidates.length) {
    candidates = lines.map((l) => l.trim()).filter((l) => l && /^[A-Z][^:]{2,80}$/.test(l));
  }
  const seen = new Set();
  const cleaned = [];
  for (let c of candidates) {
    c = c.split(":")[0].split(".")[0].trim()
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\s{2,}/g, " ")
      .replace(/\.$/, "");
    if (c && !seen.has(c.toLowerCase())) {
      seen.add(c.toLowerCase());
      cleaned.push(c);
    }
  }
  return cleaned.slice(0, 4);
}
__name(itemsFromText, "itemsFromText");

function toOneSentence(items) {
  if (!items.length) return "";
  if (items.length === 1) return `I’ve worked on ${items[0]}. Want me to dive into that?`;
  const last = items.pop();
  return `I’ve worked on ${items.join(", ")}, and ${last}. Want me to dive into one of these?`;
}
__name(toOneSentence, "toOneSentence");

function enforceBroadStyle(text, isBroad) {
  if (!isBroad) return text;
  if (/^I['’]ve worked on/i.test(text)) return text.replace(/\s+/g, " ").trim();
  const items = itemsFromText(text);
  if (items.length) return toOneSentence(items);
  return `Got it. I can go into projects like dashboards, workforce planning, or turnover models — which one sounds most useful?`;
}
__name(enforceBroadStyle, "enforceBroadStyle");

// Guardrail: remove unintended name-drops of companies not in Tony’s history
function scrubUnknownEmployers(t = "") {
  const known = ["quibi", "flowserve", "sony", "hbo", "nbcuniversal", "roadr"];
  const bads  = ["disney","netflix","warner bros","warner brothers","hulu","amazon","meta"];
  const lower = t.toLowerCase();
  const hasKnown = known.some((k) => lower.includes(k));
  const hasBad   = bads.some((b) => lower.includes(b));
  return hasBad && !hasKnown
    ? t.replace(/\b(Disney|Netflix|Warner Bros\.?|Warner Brothers|Hulu|Amazon|Meta)\b/gi, "—")
    : t;
}
__name(scrubUnknownEmployers, "scrubUnknownEmployers");

/* ==================== LLM Call (with simple retry) ==================== */

async function callLLM({ env, model, messages, temperature, maxTokens }) {
  const hasOpenAI = !!env.OPENAI_API_KEY;
  const hasGroq   = !!env.GROQ_API_KEY;

  if (!hasOpenAI && !hasGroq) {
    throw new Error("No model provider configured (set OPENAI_API_KEY or GROQ_API_KEY).");
  }

  // Build request
  let apiUrl, headers, payload;
  if (hasGroq) {
    apiUrl  = "https://api.groq.com/openai/v1/chat/completions";
    headers = { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" };
    payload = { model, messages, temperature, max_tokens: maxTokens };
  } else {
    apiUrl  = "https://api.openai.com/v1/chat/completions";
    headers = { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" };
    payload = { model: "gpt-4o-mini", messages, temperature, max_tokens: maxTokens };
  }

  // Try once, then one backoff retry on rate limit / upstream
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify(payload) });
    if (resp.ok) {
      const data = await resp.json();
      return (data?.choices?.[0]?.message?.content || "").trim();
    }
    const txt = await resp.text();
    const retryable = resp.status === 429 || (resp.status === 502 && /rate limit|tokens per minute/i.test(txt));
    if (!retryable || attempt === 1) {
      throw new Error(`Upstream error (${resp.status}): ${txt}`);
    }
    // parse suggested wait if present, else 1800ms
    let waitMs = 1800;
    const m = txt.match(/try again in ([0-9.]+)s/i);
    if (m) { waitMs = Math.min(5000, Math.max(800, Math.floor(parseFloat(m[1]) * 1000))); }
    await new Promise(r => setTimeout(r, waitMs));
  }
}
__name(callLLM, "callLLM");

/* ==================== Worker ==================== */

var worker_default = {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), { headers: cors() });
    }

    // CORS preflight
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

    // Chat endpoint
    if (url.pathname === "/chat" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        const userMsg = (body?.message || "").toString().trim();
        if (!userMsg) {
          return new Response(JSON.stringify({ error: "Missing 'message' in request body." }), { status: 400, headers: cors() });
        }

        const history = Array.isArray(body?.history) ? body.history : [];
        const past = history
          .filter((m) => m?.role && m?.content)
          .map((m) => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-10); // keep shorter to reduce token use

        const clientSystem = (body?.system || "").toString().trim();
        const systemPrompt = clientSystem || SYSTEM_PROMPT;

        // Local topics shortcut
        if (/\b(topics?|what can (you|u) cover|what do you cover|what can you talk about|what else)\b/i.test(userMsg)) {
          const text = "Here are topics I’m happy to cover: real-world case studies; behind the scenes; career pivots; the human side of data; tools & workflows; future outlook. Which one should I start with?";
          return new Response(JSON.stringify({ reply: text }), { headers: cors() });
        }

        // Simple “yes/ok” follow-up helper
        if (/^(yes|yeah|yep|sure|ok|okay|please|go ahead)$/i.test(userMsg) && past.length) {
          const lastAssistant = [...past].reverse().find((m) => m.role === "assistant")?.content || "";
          const followUp = lastAssistant.match(/([A-Z][^?]{4,150}\?)\s*$/m);
          if (followUp) {
            return new Response(JSON.stringify({ reply: `Great — ${followUp[1]}` }), { headers: cors() });
          }
        }

        // Compose messages
        const broad = isBroadCareerAsk(userMsg);
        const pre = broad ? [{ role: "system", content: CONCISE_DIRECTIVE }] : [];
        const messages = [{ role: "system", content: systemPrompt }, ...pre, ...past, { role: "user", content: userMsg }];

        // Model selection / aliases
        const ALIAS = {
          "llama3-8b-8192": "llama-3.1-8b-instant",
          "llama3-70b-8192": "llama-3.1-70b-versatile"
        };
        let model = (body?.model || "llama-3.1-8b-instant").toString();
        if (ALIAS[model]) model = ALIAS[model];

        // Inference settings: keep it grounded and tidy
        const temperature = Number.isFinite(+body?.temperature) ? +body.temperature : (broad ? 0.2 : 0.25);
        const maxTokens   = broad ? 220 : 600; // smaller to respect TPM

        // Call LLM (with backoff)
        let raw;
        try {
          raw = await callLLM({ env, model, messages, temperature, maxTokens });
        } catch (err) {
          return new Response(JSON.stringify({ error: "Upstream error", detail: String(err) }), { status: 502, headers: cors() });
        }

        // Post-process: strip markdown, enforce broad style, guard company list
        const clean = scrubUnknownEmployers(enforceBroadStyle(scrubMarkdown(raw), broad)) || "Sorry—no response was generated.";

        return new Response(JSON.stringify({ reply: clean }), { headers: cors() });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Server error", details: String(err) }), { status: 500, headers: cors() });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  }
};

export { worker_default as default };
//# sourceMappingURL=worker.js.map
