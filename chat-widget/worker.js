// Purpose: Simple Copilot Worker (pre-data version). Uses system.md only; no resume/faq retrieval.

// ===== Config =====
const MODEL = "gpt-4o-mini"; // adjust if you used a different model previously
const SYSTEM_MD_URL = "https://tonyabdelmalak.github.io/assets/chat/system.md"; // your existing system.md

// ===== Cache =====
let SYSTEM_MD_CACHE = null;

// Load system.md (cached)
async function loadSystemMd() {
  if (SYSTEM_MD_CACHE) return SYSTEM_MD_CACHE;
  const res = await fetch(SYSTEM_MD_URL, { cf: { cacheTtl: 1800 } });
  if (!res.ok) throw new Error(`Failed to load system.md (${res.status})`);
  SYSTEM_MD_CACHE = await res.text();
  return SYSTEM_MD_CACHE;
}

// Build messages: just system + user (no extra knowledge blocks)
async function buildMessages(userMessage) {
  const system = await loadSystemMd();
  return [
    { role: "system", content: system },
    { role: "user", content: userMessage || "" }
  ];
}

// Call OpenAI
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
  return data.choices?.[0]?.message?.content ?? "";
}

// CORS
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

// Worker entry
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // Accept POST to "/" or "/chat" for compatibility with older frontends
    const isChatRoute = (url.pathname === "/" || url.pathname === "/chat");

    if (request.method !== "POST" || !isChatRoute) {
      return new Response(
        'POST JSON to "/" or "/chat" with {"message":"..."}',
        { status: 405, headers: corsHeaders() }
      );
    }

    try {
      const { message } = await request.json();
      const messages = await buildMessages(message || "");
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
