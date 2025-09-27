// worker.js — Groq first, OpenAI fallback — concise answers across career topics

const SYSTEM_PROMPT = `
You are Tony, speaking in first person. Write in plain text (no Markdown headings/emphasis).
Be brief and human. If unsure, ask one focused follow-up.
Prefer a single sentence over bullets unless the user explicitly asks for a list.
`.trim();

// Used when the user asks broadly about career-related topics (not a specific item)
const CONCISE_DIRECTIVE = `
User is asking broadly about Tony's career (journey, pivot to AI-driven analytics, past experience/employers,
resume, current projects, accomplishments/impact, dashboards).
Reply in <= 70 words, one conversational sentence naming 3–4 representative items relevant to the ask,
then end with exactly ONE engaging follow-up question to invite a deeper dive.
Examples:
- "I pivoted from HR ops into AI-driven analytics, building workforce planning models, interactive recruitment dashboards,
  and attrition-risk tools. Where should we start?"
- "Recent work: compliance/attrition automation, recruitment funnel dashboards, workforce forecasts, and an explainable
  attrition-risk prototype. Want a quick walkthrough of one?"
No bullets. One sentence if possible (two max). No "What I did/Outcome" boilerplate.
`.trim();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}

// ---------- INTENT: detect broad, non-specific asks across ALL career topics ----------
function isBroadCareerAsk(t = "") {
  const s = t.toLowerCase();

  // Must mention one of these broad domains
  const domainHit = /(project|projects|dashboard|dashboards|career|journey|pivot|resume|experience|employment|work history|accomplish|impact)\b/.test(s);
  if (!domainHit) return false;

  // Consider it "specific" if they reference a particular item/company/tech/metric
  const specifics = [
    // projects & dashboards
    "turnover","attrition","workforce","funnel","recruit","forecast","risk","tableau","sql","python","workday","power bi","greenhouse","successfactors",
    // employers / named orgs
    "quibi","flowserve","sony","hbo","nbcuniversal","roadr",
    // concrete actions/links
    "open","link","url","show","see","download","pdf",
    // numbers/metrics often signal a specific ask
    "percent","%","hours","time to fill","time-to-fill","headcount","ramp","overtime"
  ];
  const hasSpecific = specifics.some(k => s.includes(k));
  return !hasSpecific;
}

// ---------- SCRUB: plain text; remove boilerplate; normalize  ----------
function scrubMarkdown(t = "") {
  if (!t) return "";
  t = t.replace(/\r\n/g, "\n");

  // Remove lines we don't want the user to see
  t = t.replace(/\bWhat I say:\s*[“"][\s\S]*?[”"](?:\n|$)/g, "");
  t = t.replace(/\bWhat I say:.*(?:\n|$)/g, "");
  t = t.replace(/^\s*-\s*What I did:.*(?:\n|$)/gmi, "");
  t = t.replace(/^\s*-\s*Outcome:.*(?:\n|$)/gmi, "");
  t = t.replace(/^\s*-\s*Follow-up:.*(?:\n|$)/gmi, "");

  // Strip emphasis markers, keep words
  t = t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/_(.*?)_/g, "$1");

  // Normalize list markers if model returns them
  t = t.replace(/^\s*\+\s+/gm, "  - ");
  t = t.replace(/^\s*\*\s+/gm, "- ");

  // Remove markdown headings/quotes
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, "");
  t = t.replace(/^\s*>\s?/gm, "");

  // Collapse blank lines; trim line-end spaces
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.split("\n").map(l => l.replace(/[ \t]+$/g, "")).join("\n");

  return t.trim();
}

// Final clamp for broad replies (safety if model ignores directive)
function clampIfBroad(text, isBroad) {
  if (!isBroad) return text;
  // If <= 320 chars, allow; otherwise keep first sentence and ask a follow-up
  if (text.length <= 320) return text;
  const first = (text.split(/(?<=\.)\s+/)[0] || text).slice(0, 280);
  const ask = " Which area would you like to dive into?";
  return (first.endsWith(".") ? first : first + ".") + ask;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

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
        const past = history.filter(m => m?.role && m?.content)
                            .map(m => ({ role: m.role, content: m.content.toString().trim() }))
                            .slice(-12);

        const clientSystem = (body?.system || "").toString().trim();
        const systemPrompt = clientSystem || SYSTEM_PROMPT;

        const broad = isBroadCareerAsk(userMsg);
        const pre = broad ? [{ role: "system", content: CONCISE_DIRECTIVE }] : [];

        // Model aliases
        const ALIAS = { "llama3-8b-8192": "llama-3.1-8b-instant", "llama3-70b-8192": "llama-3.1-70b-versatile" };
        let model = (body?.model || "llama-3.1-8b-instant").toString();
        if (ALIAS[model]) model = ALIAS[model];

        const temperature = Number.isFinite(+body?.temperature) ? +body.temperature : (broad ? 0.2 : 0.25);
        const maxTokens  = broad ? 220 : 900;

        const messages = [{ role: "system", content: systemPrompt }, ...pre, ...past, { role: "user", content: userMsg }];

        // Provider selection
        const hasOpenAI = !!env.OPENAI_API_KEY;
        const hasGroq   = !!env.GROQ_API_KEY;
        if (!hasOpenAI && !hasGroq) {
          return new Response(JSON.stringify({ error: "No model provider configured (set OPENAI_API_KEY or GROQ_API_KEY)." }), {
            status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
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
          return new Response(JSON.stringify({ detail: { error: { message: txt } }, error: "Upstream error", status: resp.status }), {
            status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        const data  = await resp.json();
        const raw   = data?.choices?.[0]?.message?.content?.trim() || "Sorry—no response was generated.";
        const clean = scrubMarkdown(raw);
        const reply = clampIfBroad(clean, broad);

        return new Response(JSON.stringify({ reply }), {
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Server error", details: String(err) }), {
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};
