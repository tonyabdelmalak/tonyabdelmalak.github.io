// worker.js — Tony’s Copilot (Groq first, OpenAI fallback)
// - Persona kept ONLY in system role (never echoed)
// - Broad asks collapse to 1 short, conversational sentence + 1 follow-up
// - Strips meta/persona leaks and boilerplate before returning
// - Plain text output; no markdown headings/emphasis rendered

/***********************
 * Persona (hidden)
 ***********************/
const SYSTEM_PROMPT = `
You are Tony speaking in FIRST PERSON.
Write plainly and briefly. If unsure, ask one focused follow-up.
Prefer a single conversational sentence unless the user asks for details.

Tone: warm, expert, direct. No private/sensitive info. If asked for something private, decline and point to public site sections (Projects, Dashboards, Case Studies, Resume, About, Chat Widget).

Context about Tony:
- People & Business Insights Analyst based in Los Angeles
- Pivoted from HR ops to AI-driven analytics
- Uses Tableau, SQL, Python, Workday, lightweight AI copilots
- Impact examples: reduced hiring gaps ~20%, moderated overtime, improved retention (+18% at Flowserve)
- Representative projects: turnover/early-attrition analysis, workforce planning forecasts, recruitment-funnel dashboards, explainable attrition-risk prototype
`.trim();

/*********************************
 * Concise directive for broad asks
 *********************************/
const CONCISE_DIRECTIVE = `
User is asking broadly about Tony's career (journey, pivot to AI-driven analytics, past experience/employers, resume, current projects, accomplishments/impact, dashboards).
Reply in ≤ 60 words as ONE conversational sentence naming 3–4 representative items relevant to the ask.
End with exactly ONE short follow-up question to invite a deeper dive.
No bullets. No "What I did/Outcome/Follow-up/What I say" boilerplate. No meta comments about personas.
`.trim();

/***********************
 * CORS helpers
 ***********************/
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}
function cors() {
  return { "Content-Type": "application/json", ...corsHeaders() };
}

/********************************************
 * Broad intent detector (all career topics)
 ********************************************/
function isBroadCareerAsk(t = "") {
  const s = t.toLowerCase();
  const domainHit = /(project|projects|dashboard|dashboards|career|journey|pivot|resume|experience|employment|work history|accomplish|impact)\b/.test(s);
  if (!domainHit) return false;

  const specifics = [
    // projects & dashboards / tools
    "turnover","attrition","workforce","funnel","recruit","forecast","risk","tableau","sql","python","workday","power bi",
    "greenhouse","successfactors",
    // known employers/projects you mentioned
    "quibi","flowserve","sony","hbo","nbcuniversal","roadr",
    // concrete actions/links
    "open","link","url","show","see","download","pdf",
    // numbers/metrics signal a specific ask
    "percent","%","hours","time to fill","time-to-fill","headcount","ramp","overtime"
  ];
  return !specifics.some(k => s.includes(k));
}

/********************************************
 * Scrub/normalize model text before UI
 ********************************************/
function scrubMarkdown(t = "") {
  if (!t) return "";
  t = t.replace(/\r\n/g, "\n");

  // Remove meta/system/persona leakage
  const metaPatterns = [
    /system persona[^.\n]*tony'?s agent[^.\n]*/gi,
    /this persona[^.\n]*designed to[^.\n]*/gi,
    /as (an?|the) (ai|language) model[^.\n]*/gi,
    /i provided a system persona[^.\n]*/gi,
    /I cannot provide personal data about Tony[^.\n]*/gi,
  ];
  metaPatterns.forEach(rx => t = t.replace(rx, ""));

  // Remove boilerplate lines sometimes learned from markdown content
  t = t.replace(/\bWhat I say:\s*[“"][\s\S]*?[”"](?:\n|$)/g, "");
  t = t.replace(/\bWhat I say:.*(?:\n|$)/g, "");
  t = t.replace(/^\s*-\s*What I did:.*(?:\n|$)/gmi, "");
  t = t.replace(/^\s*-\s*Outcome:.*(?:\n|$)/gmi, "");
  t = t.replace(/^\s*-\s*Follow-up:.*(?:\n|$)/gmi, "");

  // Strip emphasis markers, keep words
  t = t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/_(.*?)_/g, "$1");

  // Normalize list markers if present
  t = t.replace(/^\s*\+\s+/gm, "- ");
  t = t.replace(/^\s*\*\s+/gm, "- ");

  // Remove markdown headings/quotes
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, "");
  t = t.replace(/^\s*>\s?/gm, "");

  // Collapse excessive blanks; trim right spaces
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.split("\n").map(l => l.replace(/[ \t]+$/g, "")).join("\n");

  // Final trim
  return t.trim();
}

/***********************************************************
 * Collapse long/bulleted text to one short sentence if broad
 ***********************************************************/
function itemsFromText(t = "") {
  const lines = t.split("\n");

  // 1) bullet-like lines
  let bullets = lines.filter(l => /^\s*-\s+/.test(l)).map(l => l.replace(/^\s*-\s+/, ""));

  // 2) or title-ish lines (fallback)
  if (bullets.length === 0) {
    bullets = lines
      .map(l => l.trim())
      .filter(l => l && /^[A-Z][^:]{2,80}$/.test(l));
  }

  bullets = bullets.map(b => b.split(":")[0]);
  const seen = new Set();
  const cleaned = [];
  for (const b of bullets) {
    const x = b.replace(/[\u2013\u2014]/g, "-").replace(/\s{2,}/g, " ").replace(/\.$/, "").trim();
    if (x && !seen.has(x.toLowerCase())) {
      seen.add(x.toLowerCase());
      cleaned.push(x);
    }
  }
  return cleaned.slice(0, 4);
}

function toOneSentence(items) {
  if (!items.length) return "";
  if (items.length === 1) return `I’ve worked on ${items[0]}. Which area would you like to dive into?`;
  const last = items.pop();
  return `I’ve worked on ${items.join(", ")}, and ${last}. Which area would you like to dive into?`;
}

function enforceBroadStyle(text, isBroad) {
  if (!isBroad) return text;

  // If already short and not a list, just ensure a question
  const short = text.length <= 320 && !/^\s*-\s/m.test(text);
  if (short) {
    return /[?]\s*$/.test(text) ? text : (text.replace(/\.*\s*$/, "") + ". Which area would you like to dive into?");
  }

  // Try to compress lists/titles into a single sentence
  const items = itemsFromText(text);
  if (items.length) return toOneSentence(items);

  // Fallback: keep first sentence + ask a follow-up
  const first = (text.split(/(?<=\.)\s+/)[0] || text).slice(0, 280);
  return (first.endsWith(".") ? first : first + ".") + " Which area would you like to dive into?";
}

/***********************
 * Provider plumbing
 ***********************/
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Health
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), { headers: cors() });
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
        if (!userMsg) {
          return new Response(JSON.stringify({ error: "Missing 'message' in request body." }), { status: 400, headers: cors() });
        }

        // History (optional)
        const history = Array.isArray(body?.history) ? body.history : [];
        const past = history
          .filter(m => m?.role && m?.content)
          .map(m => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-12);

        // Prefer system.md from widget when provided
        const clientSystem = (body?.system || "").toString().trim();
        const systemPrompt = clientSystem || SYSTEM_PROMPT;

        // Broad vs specific
        const broad = isBroadCareerAsk(userMsg);
        const pre = broad ? [{ role: "system", content: CONCISE_DIRECTIVE }] : [];

        // Model aliases (Groq deprecated names)
        const ALIAS = {
          "llama3-8b-8192": "llama-3.1-8b-instant",
          "llama3-70b-8192": "llama-3.1-70b-versatile",
        };
        let model = (body?.model || "llama-3.1-8b-instant").toString();
        if (ALIAS[model]) model = ALIAS[model];

        const temperature = Number.isFinite(+body?.temperature) ? +body.temperature : (broad ? 0.2 : 0.25);
        const maxTokens  = broad ? 220 : 900;

        const messages = [
          { role: "system", content: systemPrompt }, // hidden persona
          ...pre,
          ...past,
          { role: "user", content: userMsg }
        ];

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
        let raw     = data?.choices?.[0]?.message?.content?.trim() || "Sorry—no response was generated.";

        // Strip persona/meta leaks and boilerplate, then enforce short style for broad asks
        raw = scrubMarkdown(raw);
        const reply = enforceBroadStyle(raw, broad);

        return new Response(JSON.stringify({ reply }), { headers: cors() });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Server error", details: String(err) }), { status: 500, headers: cors() });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};
