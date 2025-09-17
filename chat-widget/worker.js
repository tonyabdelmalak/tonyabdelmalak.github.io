// worker.js — Tony-first-person proxy (OpenAI first, fallback Groq)
// Always returns OpenAI-style {choices[0].message.content} so the widget won't break.

const GUARDRAILS = `
You are Tony speaking in FIRST PERSON. Always use "I" and "my".
Never call yourself a copilot/assistant/AI/bot. You are Tony.
Introduce yourself only on the FIRST turn of a NEW session; don't repeat unless asked "who are you" or "what is this?".
Tone: professional, direct, approachable. Use contractions. Short, active sentences.
If the user repeats a broad ask (e.g., "dashboards"), go deeper with steps, choices, tradeoffs, outcomes—do not reintroduce yourself.
When asked about dashboards: data sources → prep → modeling → visuals → interactivity → impact.
If context is unclear, ask one focused question, then proceed with best-practice guidance.
Replies ≤ 120 words unless returning code.
`.trim();

const INTRO_BLOCKLIST = [
  "welcome to tony's copilot",
  "i'm your copilot",
  "welcome to tony abdelmalak's github",
  "i'm tony's copilot"
];

function CORS() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization"
  };
}
function j(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS(), "Content-Type": "application/json" }
  });
}

function sanitizeHistory(msgs = []) {
  return msgs.filter(m => {
    if (!m || !m.role || !m.content) return false;
    if (m.role !== "assistant") return true;
    const t = String(m.content).toLowerCase();
    return !INTRO_BLOCKLIST.some(p => t.includes(p));
  });
}

function normalizeMessages(body) {
  // Preferred: { messages: [{role,content}, ...] }
  if (Array.isArray(body?.messages) && body.messages.length) {
    const msgs = sanitizeHistory(body.messages.map(m => ({
      role: m.role, content: String(m.content || "").trim()
    })));
    const hasSystem = msgs.some(m => m.role === "system");
    return hasSystem ? msgs : [{ role: "system", content: GUARDRAILS }, ...msgs];
  }
  // Legacy: { message, history }
  const userMsg = String(body?.message || "").trim();
  const history = Array.isArray(body?.history) ? body.history : [];
  const past = sanitizeHistory(history.map(m => ({
    role: m.role, content: String(m.content || "").trim()
  }))).slice(-12);
  const msgs = [{ role: "system", content: GUARDRAILS }, ...past];
  if (userMsg) msgs.push({ role: "user", content: userMsg });
  return msgs;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS() });
    if (url.pathname === "/health") return j({ ok: true, ts: Date.now() });

    if (url.pathname === "/chat" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));

        const hasOpenAI = !!env.OPENAI_API_KEY;
        const hasGroq = !!env.GROQ_API_KEY;
        if (!hasOpenAI && !hasGroq) return j({ error: "No provider key set (OPENAI_API_KEY or GROQ_API_KEY)." }, 500);

        const messages = normalizeMessages(body);
        const temperature = Number(body?.temperature ?? 0.3);

        let apiUrl, headers, payload;
        if (hasOpenAI) {
          apiUrl = "https://api.openai.com/v1/chat/completions";
          headers = { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" };
          payload = { model: "gpt-4o-mini", messages, temperature, max_tokens: 500 };
        } else {
          apiUrl = "https://api.groq.com/openai/v1/chat/completions";
          headers = { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" };
          payload = { model: "llama-3.1-8b-instant", messages, temperature, max_tokens: 500 };
        }

        const upstream = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify(payload) });
        if (!upstream.ok) {
          const txt = await upstream.text();
          return j({
            id: "proxy-error",
            object: "chat.completion",
            choices: [{ index: 0, message: { role: "assistant", content: "Upstream model error. Please try again." }, finish_reason: "stop" }],
            error: { status: upstream.status, details: txt }
          }, 502);
        }

        const data = await upstream.json();
        const content =
          data?.choices?.[0]?.message?.content ??
          data?.reply ??
          data?.message ?? "";

        return j({
          id: data?.id || "proxy-response",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: payload.model,
          choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }]
        });
      } catch (err) {
        return j({
          id: "proxy-exception",
          object: "chat.completion",
          choices: [{ index: 0, message: { role: "assistant", content: "Server exception. Please try again." }, finish_reason: "stop" }],
          error: { details: String(err) }
        }, 500);
      }
    }

    return new Response("Not found", { status: 404, headers: CORS() });
  }
};
