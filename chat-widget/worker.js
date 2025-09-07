// Purpose: Cloudflare Worker for Tony's Copilot—loads resume/faq, handles sensitive topics, calls OpenAI.

// == Config ==
const MODEL = "gpt-4o-mini"; // change if desired
const SYSTEM_MD_URL = "https://tonyabdelmalak.github.io/assets/chat/system.md";
const KNOWLEDGE_URLS = [
  "https://tonyabdelmalak.github.io/data/resume.json",
  "https://tonyabdelmalak.github.io/data/faq.md"
];

// == Caches ==
let KNOWLEDGE_CACHE = null;
let SYSTEM_MD_CACHE = null;

// == Tone guide for sensitive topics ==
const SENSITIVE_TONE = `
When questions touch on gaps, layoffs, terminations, or “why you left”:
- Be brief, direct, confident.
- One line to acknowledge, one to reframe (growth), one to bridge (impact now).
- Friendly, light—never defensive or apologetic.
- Offer a next step (e.g., view dashboards/resume page).
`;

// == Intent patterns ==
const INTENT_PATTERNS = [
  /gap/i, /employment gap/i, /unemployed/i, /between jobs/i,
  /laid off/i, /layoff/i, /fired/i, /termination/i,
  /why.*left/i, /reason.*left/i, /resume/i, /background/i, /experience/i
];
function detectSensitiveIntent(msg) {
  return INTENT_PATTERNS.some(rx => rx.test(msg || ""));
}

// == Loader: system.md ==
async function loadSystemMd() {
  if (SYSTEM_MD_CACHE) return SYSTEM_MD_CACHE;
  const res = await fetch(SYSTEM_MD_URL, { cf: { cacheTtl: 1800 } });
  const txt = await res.text();
  SYSTEM_MD_CACHE = txt;
  return SYSTEM_MD_CACHE;
}

// == Loader: resume.json + faq.md ==
async function loadKnowledge() {
  if (KNOWLEDGE_CACHE) return KNOWLEDGE_CACHE;
  const [resumeRes, faqRes] = await Promise.all(
    KNOWLEDGE_URLS.map(u => fetch(u, { cf: { cacheTtl: 3600 } }))
  );
  const resume = await resumeRes.json();
  const faq = await faqRes.text();
  const flatResume = JSON.stringify(resume, null, 2);
  KNOWLEDGE_CACHE = { resume, faq, flatText: flatResume + "\n\n" + faq };
  return KNOWLEDGE_CACHE;
}

// == Simple snippet ranker ==
function topSnippets(text, query, k = 8) {
  const qs = (query || "").toLowerCase().split(/\W+/).filter(Boolean);
  const parts = text.split(/\n{1,}/);
  return parts
    .map(p => {
      const t = p.toLowerCase();
      const score = qs.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
      return { p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(x => x.p.trim())
    .filter(Boolean);
}

// == Build system prompt ==
async function buildSystemPrompt() {
  const base = await loadSystemMd();
  return `
${base}
---
Use Site-Knowledge first for résumé, dates, gaps, tools, projects, and impact.
Quote months/years from resume.json. If unknown, say so and link to /about.
${SENSITIVE_TONE}
`;
}

// == Build messages with optional sensitive micro-playbook ==
async function buildContext(userMessage) {
  const k = await loadKnowledge();
  const picks = topSnippets(k.flatText, userMessage, 8);

  const siteKnowledgeBlock =
    picks.length
      ? `Site-Knowledge:\n${picks.join("\n")}\n\n`
      : "Site-Knowledge: (no direct match)\n\n";

  const sensi = detectSensitiveIntent(userMessage);
  const gap = (k.resume && k.resume.gaps && k.resume.gaps[0]) || null;
  const gapText = gap ? `${gap.from}–${gap.to}` : null;

  const sensitiveAddendum = sensi ? `
Use this 3-step micro-playbook:
1) Brief acknowledge (one short sentence${gapText ? `; use ${gapText}` : ""} if relevant).
2) Reframe to growth/skills/results (pull from projects/impact).
3) Bridge to value now + optional next step link (/dashboards or /resume).
Favor warm, light confidence; avoid apology language.
` : "";

  const system = await buildSystemPrompt();

  const messages = [
    { role: "system", content: system + sensitiveAddendum },
    { role: "user", content: siteKnowledgeBlock + "User: " + userMessage }
  ];

  return messages;
}

// == OpenAI call ==
async function callOpenAI(env, messages) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.5,
      max_tokens: 350
    })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

// == CORS helper ==
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

// == Worker entry ==
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return new Response("Use POST with JSON: { message: string }", { status: 405, headers: corsHeaders() });
    }
    try {
      const { message } = await request.json();
      const messages = await buildContext(message || "");
      const answer = await callOpenAI(env, messages);
      return new Response(JSON.stringify({ answer }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders() }
      });
    }
  }
};
