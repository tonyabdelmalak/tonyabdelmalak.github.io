// worker.js — First-person Tony proxy (OpenAI first, fallback to Groq)
// Enforces "I"/"my", forbids "copilot/assistant/bot", and strips legacy intros.

const GUARDRAILS = `
You are Tony speaking in FIRST PERSON. Always use "I" and "my".
Never refer to yourself as a "copilot", "assistant", "AI", or "bot". You are Tony.
Introduce yourself only on the FIRST turn of a NEW session; never repeat intros unless asked "who are you" or "what is this?".
Tone: professional, direct, approachable. Use contractions. Short, active sentences.
If the user repeats a broad ask (e.g., "dashboards"), go deeper with steps, choices, tradeoffs, outcomes—do not reintroduce yourself.
When asked about dashboards: data sources → prep → modeling → visuals → interactivity → impact.
If context is unclear, ask one focused question, then proceed with best-practice guidance.
Replies ≤ 80 words unless returning code.
`.trim();

// Phrases to strip from legacy assistant history so the model doesn't learn/repeat them
const INTRO_BLOCKLIST = [
  "welcome to tony's copilot",
  "i'm your copilot",
  "welcome to tony abdelmalak's github",
  "i'm tony's copilot",
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}

function sanitizeHistory(msgs = []) {
  return msgs.filter(m => {
    if (!m || !m.role || !m.content) return false;
    if (m.role !== "assistant") return true;
    const t = String(m.content).toLowerCase();
    return !INTRO_BLOCKLIST.some(ph => t.includes(ph));
  });
}

function normalizeMessages(body) {
  // Supports either:
  // 1) { messages: [{role, content}, ...] }
  // 2) { message: "string", history: [{role, content}, ...] }
  if (Array.isArray(body?.messages) && body.messages.length) {
    const msgs = sanitizeHistory(
      body.messages.map(m => ({ role: m.role, content: String(m.content || "").trim() }))
    );
    // Ensure a single system message at top (prepend if missing)
    const hasSystem = msgs.some(m => m.role === "system");
    return hasSystem ? msgs : [{ role: "system", content: GUARDRAILS }, ...msgs];
  }

  // Legacy shape
  const userMsg = String(body?.message || "").trim();
  const history = Array.isArray(body?.history) ? body.history : [];
  const past = sanitizeHistory(
    history
      .filter(m => m && m.role && m.content)
      .map(m => ({ role: m.role, content: String(m.content).trim() }))
  ).slice(-12); // keep it light

  const msgs = [{ role: "system", content: GUARDRAILS }, ...past];
  if (userMsg) msgs.push({ role: "user", content: userMsg });
  return msgs;
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

        // Provider selection
        const hasOpenAI = !!env.OPENAI_API_KEY;
        const hasGroq = !!env.GROQ_API_KEY;
        if (!hasOpenAI && !hasGroq) {
          return new Response(
            JSON.stringify({ error: "No model provider configured (set OPENAI_API_KEY or GROQ_API_KEY)." }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        const messages = normalizeMessages(body);

        // Build request
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
            max_tokens: 300,
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
            max_tokens: 300,
          };
        }

        const resp = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify(payload) });

        if (!resp.ok) {
          const txt = await resp.text();
          return new Response(
            JSON.stringify({ error: "Upstream error", status: resp.status, details: txt }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        const data = await resp.json();
        // Return OpenAI/Groq-compatible payload through (so widgets that expect choices[] still work)
        return new Response(JSON.stringify(data), {
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
