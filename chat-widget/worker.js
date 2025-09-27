// worker.js — Copilot proxy (Groq first, OpenAI fallback)
// Produces short, conversational answers for broad "projects/dashboards" asks.

const SYSTEM_PROMPT = `
You are Tony, speaking in first person. Write in plain text (no Markdown headings/emphasis).
Default style: brief, human, direct. If unsure, ask one focused follow-up.
When listing, prefer a single sentence over bullets unless the user explicitly asks for a list.
`.trim();

// Injected ONLY for broad “projects/dashboards” asks
const CONCISE_PROJECTS_DIRECTIVE = `
User is asking broadly about projects/dashboards/background/work experience/accomplishments (not a specific one).
Reply in <= 60 words, one conversational sentence, naming 3–4 representative items.
Example style: "I've worked on automation of compliance/attrition reporting, interactive recruitment dashboards, workforce planning models, and attrition-risk dashboards. Which one would you like to dive into?"
No bullets. End with exactly ONE short follow-up question.
`.trim();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}

// --- simple intent check for broad "projects/dashboards" queries
function isBroadProjectsAsk(t = "") {
  const s = t.toLowerCase();
  const hits = /(project|projects|dashboard|dashboards)\b/.test(s);
  if (!hits) return false;
  // treat as "broad" if no obvious specific item is mentioned
  const specificHints = [
    "turnover", "attrition", "workforce", "funnel", "recruit", "forecast",
    "quibi", "flowserve", "sony", "hbo", "roadr", "nbcuniversal",
    "open", "link", "url", "tableau", "show", "see"
  ];
  const hasSpecific = specificHints.some(k => s.includes(k));
  return hits && !hasSpecific;
}

// --- Server-side scrubber: plain text + normalized bullets; remove boilerplate lines
function scrubMarkdown(t = "") {
  if (!t) return "";

  t = t.replace(/\r\n/g, "\n");

  // Remove lines that shouldn’t show
  t = t.replace(/\bWhat I say:\s*[“"][\s\S]*?[”"](?:\n|$)/g, "");
  t = t.replace(/\bWhat I say:.*(?:\n|$)/g, "");
  t = t.replace(/^\s*-\s*What I did:.*(?:\n|$)/gmi, "");
  t = t.replace(/^\s*-\s*Outcome:.*(?:\n|$)/gmi, "");
  t = t.replace(/^\s*-\s*Follow-up:.*(?:\n|$)/gmi, "");

  // Strip emphasis markers but keep text
  t = t.replace(/\*\*(.*?)\*\*/g, "$1"); // **bold**
  t = t.replace(/\*(.*?)\*/g, "$1");     // *italic*
  t = t.replace(/_(.*?)_/g, "$1");       // _italic_

  // Convert list markers
  t = t.replace(/^\s*\+\s+/gm, "  - ");  // "+ " → sub-bullet
  t = t.replace(/^\s*\*\s+/gm, "- ");    // "* " → bullet

  // Remove markdown headings/quotes
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, "");
  t = t.replace(/^\s*>\s?/gm, "");

  // Collapse too many blank lines
  t = t.replace(/\n{3,}/g, "\n\n");

  // Trim line-end spaces
  t = t.split("\n").map(line => line.replace(/[ \t]+$/g, "")).join("\n");

  return t.trim();
}

// Optional: final clamp for broad lists (hard cap as safety)
function clampProjectsIfBroad(text, isBroad) {
  if (!isBroad) return text;
  // keep to roughly 80–120 chars + question if model ignored directive
  const max = 320;
  if (text.length <= max) return text;
  // keep first sentence, append a follow-up
  const firstSentence = (text.split(/(?<=\.)\s+/)[0] || text).slice(0, max);
  const ask = " Which would you like to hear about?";
  return (firstSentence.endsWith(".") ? firstSentence : firstSentence + ".") + ask;
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
          .filter(m => m && m.role && m.content)
          .map(m => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-12);

        // Prefer client-provided system; fallback to embedded persona
        const clientSystem = (body?.system || "").toString().trim();
        const systemPrompt = clientSystem || SYSTEM_PROMPT;

        // Intent: broad projects/dashboards?
        const broad = isBroadProjectsAsk(userMsg);
        const preMessages = broad ? [{ role: "system", content: CONCISE_PROJECTS_DIRECTIVE }] : [];

        // Model aliases
        const MODEL_ALIASES = {
          "llama3-8b-8192": "llama-3.1-8b-instant",
          "llama3-70b-8192": "llama-3.1-70b-versatile",
        };
        let model = (body?.model || "llama-3.1-8b-instant").toString();
        if (MODEL_ALIASES[model]) model = MODEL_ALIASES[model];

        const temperature = Number.isFinite(+body?.temperature) ? +body.temperature : (broad ? 0.2 : 0.25);
        const maxTokens = broad ? 220 : 900;

        const messages = [
          { role: "system", content: systemPrompt },
          ...preMessages,
          ...past,
          { role: "user", content: userMsg },
        ];

        // Provider selection
        const hasOpenAI = !!env.OPENAI_API_KEY;
        const hasGroq   = !!env.GROQ_API_KEY;

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
          payload = { model, messages, temperature, max_tokens: maxTokens };
        } else {
          apiUrl = "https://api.openai.com/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          };
          payload = { model: "gpt-4o-mini", messages, temperature, max_tokens: maxTokens };
        }

        const resp = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify(payload) });

        if (!resp.ok) {
          const txt = await resp.text();
          return new Response(JSON.stringify({ detail: { error: { message: txt } }, error: "Upstream error", status: resp.status }), {
            status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        const data = await resp.json();
        const raw  = data?.choices?.[0]?.message?.content?.trim() || "Sorry—no response was generated.";
        const clean = scrubMarkdown(raw);
        const reply = clampProjectsIfBroad(clean, broad);

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
