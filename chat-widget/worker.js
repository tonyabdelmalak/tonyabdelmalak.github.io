// worker.js — Tony’s Copilot (Groq first, OpenAI fallback)
// - Short, conversational replies for broad career/pivot/experience/projects/resume/dashboards asks
// - Plain text output (no headings/emphasis), strips boilerplate, clamps length
// - Employer whitelist scrub (prevents “Disney/Netflix/…” hallucinations)

const SYSTEM_PROMPT = `
You are Tony speaking in FIRST PERSON. Plain text only (no markdown headings/emphasis).
Be brief and human (≤60 words unless asked for more). If unsure, ask one focused follow-up.

Critical truth constraints:
- Do NOT invent employers, projects, or metrics.
- Only mention employers from this list: Quibi, Flowserve, Sony Pictures, Roadr, HBO, NBCUniversal.
- If asked about a company not in that list, say: "I haven't worked there."
- If the prompt is vague (e.g., "continue"), ask what they'd like more on.

Topics: my pivot HR→AI analytics; dashboards/models/AI copilots; Tableau/SQL/Python/Workday; results & impact; resume Qs.
Keep replies short, conversational, and accurate. If you don’t know, say so.
`.trim();

// Extra directive applied only to broad, non-specific asks across career topics
const CONCISE_DIRECTIVE = `
User is asking broadly about Tony's career (journey, pivot to AI-driven analytics, past experience/employers,
resume, current projects, accomplishments/impact, dashboards).
Reply in <= 60 words, one conversational sentence naming 3–4 representative items relevant to the ask.
End with exactly ONE short follow-up question to invite a deeper dive.
No bullets. No 'What I did/Outcome/Follow-up/What I say' boilerplate.
`.trim();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}
function cors() { return { "Content-Type": "application/json", ...corsHeaders() }; }

// -------- broad-ask detection (covers all career topics) --------
function isBroadCareerAsk(t = "") {
  const s = t.toLowerCase();
  const domainHit = /(project|projects|dashboard|dashboards|career|journey|pivot|resume|experience|employment|work history|accomplish|impact)\b/.test(s);
  if (!domainHit) return false;

  const specifics = [
    // projects & dashboards
    "turnover","attrition","workforce","funnel","recruit","forecast","risk","tableau","sql","python","workday","power bi",
    "greenhouse","successfactors",
    // employers / named orgs
    "quibi","flowserve","sony","hbo","nbcuniversal","roadr",
    // concrete actions/links
    "open","link","url","show","see","download","pdf",
    // numbers/metrics signal a specific ask
    "percent","%","hours","time to fill","time-to-fill","headcount","ramp","overtime"
  ];
  return !specifics.some(k => s.includes(k));
}

// -------- output scrubbing: plain text + remove boilerplate --------
function scrubMarkdown(t = "") {
  if (!t) return "";
  t = t.replace(/\r\n/g, "\n");

  // Remove boilerplate lines
  t = t.replace(/\bWhat I say:\s*[“"][\s\S]*?[”"](?:\n|$)/g, "");
  t = t.replace(/\bWhat I say:.*(?:\n|$)/g, "");
  t = t.replace(/^\s*-\s*What I did:.*(?:\n|$)/gmi, "");
  t = t.replace(/^\s*-\s*Outcome:.*(?:\n|$)/gmi, "");
  t = t.replace(/^\s*-\s*Follow-up:.*(?:\n|$)/gmi, "");

  // Strip emphasis markers, keep words
  t = t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/_(.*?)_/g, "$1");

  // Normalize any list markers if the model returns them
  t = t.replace(/^\s*\+\s+/gm, "- ");
  t = t.replace(/^\s*\*\s+/gm, "- ");

  // Remove markdown headings/quotes
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, "");
  t = t.replace(/^\s*>\s?/gm, "");

  // Collapse blank lines; trim line-end spaces
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.split("\n").map(l => l.replace(/[ \t]+$/g, "")).join("\n");

  return t.trim();
}

// -------- turn long lists into one short sentence for broad replies --------
function itemsFromText(t = "") {
  const lines = t.split("\n");
  let bullets = lines.filter(l => /^\s*-\s+/.test(l)).map(l => l.replace(/^\s*-\s+/, ""));

  if (bullets.length === 0) {
    bullets = lines
      .map(l => l.trim())
      .filter(l => l && /^[A-Z][^:]{2,80}$/.test(l)); // Title-ish lines
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
  if (items.length === 1) return `I've worked on ${items[0]}. Which area would you like to dive into?`;
  const last = items.pop();
  return `I've worked on ${items.join(", ")}, and ${last}. Which area would you like to dive into?`;
}
function enforceBroadStyle(text, isBroad) {
  if (!isBroad) return text;

  const short = text.length <= 320 && !/^\s*-\s/m.test(text);
  if (short) {
    return /[?]\s*$/.test(text) ? text : (text.replace(/\.*\s*$/, "") + ". Which area would you like to dive into?");
  }

  const items = itemsFromText(text);
  if (items.length) return toOneSentence(items);

  const first = (text.split(/(?<=\.)\s+/)[0] || text).slice(0, 280);
  return (first.endsWith(".") ? first : first + ".") + " Which area would you like to dive into?";
}

// -------- employer whitelist scrub (prevents hallucinated companies) --------
const ALLOWED_EMPLOYERS = [
  "quibi","flowserve","sony pictures","roadr","hbo","nbcuniversal"
];
const COMPANY_STOP = new Set([
  "hi","hello","hey","thanks","tony","tony abdelmalak","background","projects","dashboards",
  "resume","about","analytics","ai","sql","python","tableau","workday"
]);

function extractCandidateEmployers(text = "") {
  const out = new Set();

  // 1) “at X / with X / for X …”
  const p1 = /\b(?:at|with|for|from|in)\s+([A-Z][A-Za-z&.\- ]{2,50})(?=\b)/g;
  for (const m of text.matchAll(p1)) out.add(m[1].trim().toLowerCase());

  // 2) Line-leading “X — …”
  const p2 = /(?:^|\n)\s*([A-Z][A-Za-z&.\- ]{2,50})\s[—-]\s/g;
  for (const m of text.matchAll(p2)) out.add(m[1].trim().toLowerCase());

  // 3) Bold-title style defensive
  const p3 = /(?:^|\n)\s*\*{0,2}([A-Z][A-Za-z&.\- ]{2,50})\*{0,2}\s[—-]\s/g;
  for (const m of text.matchAll(p3)) out.add(m[1].trim().toLowerCase());

  return [...out].filter(w => !COMPANY_STOP.has(w));
}
function scrubUnknownEmployers(text = "") {
  const candidates = extractCandidateEmployers(text);
  const bad = candidates.filter(w => !ALLOWED_EMPLOYERS.includes(w));
  if (!bad.length) return text;

  const list = [...new Set(bad)].slice(0, 3).join(", ");
  const base = text.replace(/\s+$/,"").replace(/\.\s*$/,""); // tidy trailing dot
  return `${base}. (Note: I haven't worked at ${list}.)`;
}

// -------- worker --------
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), { headers: cors() });
    }
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

    if (url.pathname === "/chat" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        const userMsg = (body?.message || "").toString().trim();
        if (!userMsg) {
          return new Response(JSON.stringify({ error: "Missing 'message' in request body." }), { status: 400, headers: cors() });
        }

        const history = Array.isArray(body?.history) ? body.history : [];
        const past = history.filter(m => m?.role && m?.content)
                            .map(m => ({ role: m.role, content: m.content.toString().trim() }))
                            .slice(-12);

        // Prefer client-provided system; fallback to persona above
        const clientSystem = (body?.system || "").toString().trim();
        const systemPrompt = clientSystem || SYSTEM_PROMPT;

        const broad = isBroadCareerAsk(userMsg);
        const pre = broad ? [{ role: "system", content: CONCISE_DIRECTIVE }] : [];

        // Model aliases (avoid deprecated Groq names)
        const ALIAS = { "llama3-8b-8192": "llama-3.1-8b-instant", "llama3-70b-8192": "llama-3.1-70b-versatile" };
        let model = (body?.model || "llama-3.1-8b-instant").toString();
        if (ALIAS[model]) model = ALIAS[model];

        const temperature = Number.isFinite(+body?.temperature) ? +body.temperature : (broad ? 0.2 : 0.25);
        const maxTokens  = broad ? 220 : 900;

        const messages = [{ role: "system", content: systemPrompt }, ...pre, ...past, { role: "user", content: userMsg }];

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
        const clean = scrubMarkdown(raw);
        const styled = enforceBroadStyle(clean, broad);

        // Skip employer scrub on pure greetings like “hi/hello”
        const isGreeting = /^\s*(hi|hello|hey|howdy)\b/i.test(userMsg);
        const safe = isGreeting ? styled : scrubUnknownEmployers(styled);

        return new Response(JSON.stringify({ reply: safe }), { headers: cors() });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Server error", details: String(err) }), { status: 500, headers: cors() });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};
