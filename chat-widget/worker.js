// =====================================================================
// Cloudflare Worker — Tony Chat (EXTENDED)
// - Dynamic fetch of system.md, about-tony.md, persona.json (tiny in-mem cache)
// - GROQ primary (GROQ_API_KEY), OpenRouter fallback (OPENROUTER_API_KEY)
// - Optional SSE streaming: pass { stream: true } in request body
// - Retry with timeout per provider; strict first-person voice guard
// - CORS + /health; structured JSON on non-streaming
// =====================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") return ok204();

    // Health
    if (url.pathname === "/health") return new Response("ok", { status: 200, headers: cors() });

    // Chat
    if (url.pathname === "/chat" && request.method === "POST") {
      try {
        const body = await safeJson(request);

        const model        = body.model || "llama-3.1-8b-instant";
        const temperature  = typeof body.temperature === "number" ? body.temperature : 0.275;
        const stream       = !!body.stream; // default off (your widget uses non-stream)
        const messagesIn   = Array.isArray(body.messages) ? body.messages : [];

        const systemUrl  = body.systemUrl  || "https://raw.githubusercontent.com/tonyabdelmalak/tonyabdelmalak.github.io/refs/heads/main/chat-widget/assets/chat/system.md";
        const kbUrl      = body.kbUrl      || "https://raw.githubusercontent.com/tonyabdelmalak/tonyabdelmalak.github.io/refs/heads/main/chat-widget/assets/chat/about-tony.md";
        const personaUrl = body.personaUrl || "https://raw.githubusercontent.com/tonyabdelmalak/tonyabdelmalak.github.io/refs/heads/main/chat-widget/assets/chat/persona.json";

        // Fetch guidance files with a small cache
        const [systemMd, kbMd, persona] = await Promise.all([
          cachedText(systemUrl, 300),
          cachedText(kbUrl, 300),
          cachedJson(personaUrl, 300).catch(() => ({}))
        ]);

        const personaNote = formatPersona(persona);

        // Unified system prompt — enforces first-person, punctuation, brevity
        const unifiedSystem = [
          "## Role & Voice",
          "You are Tony. Speak in the first person as Tony. Be concise, professional, friendly. Use complete sentences with proper periods.",
          "If you ever slip into third person (e.g., “Tony is…”), restate in first person before answering.",
          "",
          "## System Rules (from system.md)",
          clip(systemMd, 24000),
          "",
          "## Public Knowledge (from about-tony.md)",
          "Use only relevant details; do not dump the entire file.",
          clip(kbMd, 28000),
          "",
          "## Persona Hints (from persona.json)",
          personaNote
        ].join("\n\n");

        const messages = [{ role: "system", content: unifiedSystem }]
          .concat(messagesIn.filter(m => m && typeof m.content === "string" && m.role));

        // Streaming path (optional)
        if (stream) {
          const sse = await streamFromProviders({ env, model, temperature, messages });
          if (!sse) return json({ error: "No completion from providers" }, 502);
          return sse;
        }

        // Non-streaming (your widget uses this)
        const result = await completeFromProviders({ env, model, temperature, messages });
        if (!result || !result.text) {
          return json({ error: "No completion from providers" }, 502);
        }

        // Light post-guard
        const content = enforceFirstPerson(result.text);

        return json({
          role: "assistant",
          content,
          provider: result.provider,
          model_used: result.model_used || model,
          finish_reason: result.finish_reason || "stop"
        }, 200);

      } catch (err) {
        return json({ error: String(err && err.message || err) }, 500);
      }
    }

    return new Response("Not found", { status: 404, headers: cors() });
  }
};

/* ===================================================================== */
/*                          Provider Orchestration                        */
/* ===================================================================== */

async function completeFromProviders({ env, model, temperature, messages }) {
  // Try Groq first
  if (env.GROQ_API_KEY) {
    const r = await withRetry(() =>
      groqChat({ apiKey: env.GROQ_API_KEY, model, temperature, messages, stream: false }),
      { attempts: 2, timeoutMs: 25000 }
    );
    if (r && r.text) return { ...r, provider: "groq" };
  }

  // Fallback: OpenRouter
  if (env.OPENROUTER_API_KEY) {
    const fallbackModel = "gpt-4o-mini";
    const r = await withRetry(() =>
      openrouterChat({ apiKey: env.OPENROUTER_API_KEY, model: fallbackModel, temperature, messages, stream: false }),
      { attempts: 2, timeoutMs: 25000 }
    );
    if (r && r.text) return { ...r, provider: "openrouter", model_used: fallbackModel };
  }

  return null;
}

// Optional streaming SSE
async function streamFromProviders({ env, model, temperature, messages }) {
  if (env.GROQ_API_KEY) {
    const resp = await groqStream({ apiKey: env.GROQ_API_KEY, model, temperature, messages });
    if (resp) return resp;
  }
  if (env.OPENROUTER_API_KEY) {
    const fallbackModel = "gpt-4o-mini";
    const resp = await openrouterStream({ apiKey: env.OPENROUTER_API_KEY, model: fallbackModel, temperature, messages });
    if (resp) return resp;
  }
  return null;
}

/* ===================================================================== */
/*                            Provider Clients                            */
/* ===================================================================== */

// ---------- Groq ----------
async function groqChat({ apiKey, model, temperature, messages, stream }) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, temperature, messages,
      max_tokens: 1024,
      stream: !!stream
    }),
    signal: AbortSignal.timeout(25000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Groq ${r.status}: ${JSON.stringify(j)}`);
  const text = j.choices?.[0]?.message?.content || "";
  const finish_reason = j.choices?.[0]?.finish_reason || "stop";
  return { text, model_used: model, finish_reason };
}

async function groqStream({ apiKey, model, temperature, messages }) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature, messages, stream: true, max_tokens: 1024 })
  });
  if (!r.ok || !r.body) return null;

  const headers = { ...cors(), "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" };
  const reader = r.body.getReader();
  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) { controller.enqueue(encodeSSE("event: done\ndata: [DONE]\n\n")); controller.close(); return; }
      controller.enqueue(value); // pass-through
    },
    cancel() { try { reader.cancel(); } catch {} }
  });
  return new Response(stream, { status: 200, headers });
}

// ---------- OpenRouter ----------
async function openrouterChat({ apiKey, model, temperature, messages, stream }) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://tonyabdelmalak.com",
      "X-Title": "Tony Chat Widget"
    },
    body: JSON.stringify({
      model, temperature, messages,
      max_tokens: 1024,
      stream: !!stream
    }),
    signal: AbortSignal.timeout(25000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${JSON.stringify(j)}`);
  const text = j.choices?.[0]?.message?.content || "";
  const finish_reason = j.choices?.[0]?.finish_reason || "stop";
  return { text, model_used: model, finish_reason };
}

async function openrouterStream({ apiKey, model, temperature, messages }) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://tonyabdelmalak.com",
      "X-Title": "Tony Chat Widget"
    },
    body: JSON.stringify({ model, temperature, messages, stream: true, max_tokens: 1024 })
  });
  if (!r.ok || !r.body) return null;

  const headers = { ...cors(), "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" };
  const reader = r.body.getReader();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) { controller.enqueue(encoder.encode("event: done\ndata: [DONE]\n\n")); controller.close(); return; }
      controller.enqueue(value);
    },
    cancel() { try { reader.cancel(); } catch {} }
  });
  return new Response(stream, { status: 200, headers });
}

/* ===================================================================== */
/*                                Helpers                                 */
/* ===================================================================== */

const MEMO = new Map(); // in-mem cache

async function cachedText(u, ttl = 300) {
  const k = "T:" + u, now = Date.now(), hit = MEMO.get(k);
  if (hit && now - hit.t < ttl * 1000) return hit.v;
  const r = await fetch(u, { redirect: "follow" });
  if (!r.ok) throw new Error(`Fetch ${u} ${r.status}`);
  const v = await r.text();
  MEMO.set(k, { v, t: now });
  return v;
}

async function cachedJson(u, ttl = 300) {
  const k = "J:" + u, now = Date.now(), hit = MEMO.get(k);
  if (hit && now - hit.t < ttl * 1000) return hit.v;
  const r = await fetch(u, { redirect: "follow" });
  if (!r.ok) throw new Error(`Fetch ${u} ${r.status}`);
  const v = await r.json();
  MEMO.set(k, { v, t: now });
  return v;
}

function formatPersona(p) {
  try {
    const lines = [];
    if (p.title)   lines.push(`- Title: ${p.title}`);
    if (p.tagline) lines.push(`- Tagline: ${p.tagline}`);
    if (p.focus)   lines.push(`- Focus: ${p.focus}`);
    if (p.links && typeof p.links === "object") {
      const links = Object.entries(p.links).map(([k, v]) => `  - ${k}: ${v}`).join("\n");
      lines.push("- Links:\n" + links);
    }
    return lines.length ? lines.join("\n") : "- (empty)";
  } catch { return "- (empty)"; }
}

function clip(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n) : s; }

function enforceFirstPerson(text) {
  const t = String(text || "").trim();
  if (/^Tony\s+(is|was|does|has)\b/i.test(t)) {
    return "I " + t.replace(/^Tony\s+/, "").replace(/\s{2,}/g, " ");
  }
  return t;
}

async function withRetry(fn, { attempts = 2, timeoutMs = 25000 } = {}) {
  let err;
  for (let i = 0; i < attempts; i++) {
    try {
      const c = await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))
      ]);
      return c;
    } catch (e) { err = e; }
  }
  if (err) console.warn("withRetry exhausted:", err?.message || err);
  return null;
}

async function safeJson(req) {
  try { return await req.json(); } catch { return {}; }
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, HTTP-Referer, X-Title"
  };
}
function ok204() { return new Response(null, { status: 204, headers: cors() }); }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors() }
  });
}

// SSE helpers
const sseEncoder = new TextEncoder();
function encodeSSE(s) { return sseEncoder.encode(s); }
