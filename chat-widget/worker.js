// =====================================================================
// Cloudflare Worker — Tony Chat (EXTENDED)
// - Dynamic fetch of system.md, about-tony.md, persona.json (with small in-memory cache)
// - Primary provider: GROQ (env.GROQ_API_KEY) with a model fallback chain, fallback: OpenRouter (env.OPENROUTER_API_KEY)
// - Optional SSE streaming: include { stream: true } in request body
// - Per-provider retry with timeout; enforces first-person voice consistency
// - Provides CORS headers and /health endpoint; returns structured JSON for non-streaming
// =====================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight handling
    if (request.method === "OPTIONS") return ok204();

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: cors() });
    }

    // Chat completion endpoint
    if (url.pathname === "/chat" && request.method === "POST") {
      try {
        const body = await safeJson(request);

        const model       = pickModel(body.model, env);
        const temperature = (typeof body.temperature === "number") ? body.temperature : 0.275;
        const stream      = !!body.stream;  // default streaming off (widget uses non-streaming)
        const messagesIn  = sanitizeMessages(body);

        // Use provided URLs or fall back to Tony's GitHub repository raw URLs
        const systemUrl  = allowUrl(body.systemUrl)  || "https://raw.githubusercontent.com/tonyabdelmalak/tonyabdelmalak.github.io/refs/heads/main/chat-widget/assets/chat/system.md";
        const kbUrl      = allowUrl(body.kbUrl)      || "https://raw.githubusercontent.com/tonyabdelmalak/tonyabdelmalak.github.io/refs/heads/main/chat-widget/assets/chat/about-tony.md";
        const personaUrl = allowUrl(body.personaUrl) || "https://raw.githubusercontent.com/tonyabdelmalak/tonyabdelmalak.github.io/refs/heads/main/chat-widget/assets/chat/persona.json";

        // Fetch the guidance documents (with caching)
        const [systemMd, kbMd, persona] = await Promise.all([
          cachedText(systemUrl, 300),
          cachedText(kbUrl, 300),
          cachedJson(personaUrl, 300).catch(() => ({}))
        ]);
        const personaNote = formatPersona(persona);

        // Compose unified system prompt to steer the assistant
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

        if (!messagesIn.some(m => m.role === "user")) return json({ error: "No user message" }, 400);
        const messages = [{ role: "system", content: unifiedSystem }].concat(messagesIn);

        // Streaming SSE response (if requested)
        if (stream) {
          const sse = await streamFromProviders({ env, model, temperature, messages });
          if (!sse) return json({ error: "No completion from providers" }, 502);
          return sse;
        }

        // Standard non-streaming response
        const result = await completeFromProviders({ env, model, temperature, messages });
        if (!result || !result.text) {
          return json({ error: "No completion from providers" }, 502);
        }

        // Enforce first-person answer (post-process guard)
        const content = noEmDash(enforceFirstPerson(result.text));

        return json({
          role: "assistant",
          content,
          reply: content,
          provider: result.provider,
          model_used: result.model_used || model,
          finish_reason: result.finish_reason || "stop"
        }, 200);

      } catch (err) {
        return json({ error: String(err && err.message || err) }, 500);
      }
    }

    // Fallback for any other request
    return new Response("Not found", { status: 404, headers: cors() });
  }
};

/* ===================================================================== */
/*                        Provider Orchestration                         */
/* ===================================================================== */

async function completeFromProviders({ env, model, temperature, messages }) {
  // Primary: Groq. The original tuned model (llama-3.1-8b-instant) was retired by Groq,
  // so try the requested model first, then the closest available Llama models.
  if (env.GROQ_API_KEY) {
    for (const m of groqModelChain(model, env)) {
      const r = await withRetry(() =>
        groqChat({ apiKey: env.GROQ_API_KEY, model: m, temperature, messages, stream: false }),
        { attempts: 1, timeoutMs: 25000 }
      );
      if (r && r.text) return { ...r, provider: "groq", model_used: m };
    }
  }

  // Fallback provider (OpenRouter). OpenRouter needs the vendor-prefixed model id.
  if (env.OPENROUTER_API_KEY) {
    const fallbackModel = "openai/gpt-4o-mini";
    const r = await withRetry(() =>
      openrouterChat({ apiKey: env.OPENROUTER_API_KEY, model: fallbackModel, temperature, messages, stream: false }),
      { attempts: 2, timeoutMs: 25000 }
    );
    if (r && r.text) return { ...r, provider: "openrouter", model_used: fallbackModel };
  }

  return null;
}

// Optional SSE streaming route (tries providers in order)
async function streamFromProviders({ env, model, temperature, messages }) {
  if (env.GROQ_API_KEY) {
    for (const m of groqModelChain(model, env)) {
      const resp = await groqStream({ apiKey: env.GROQ_API_KEY, model: m, temperature, messages });
      if (resp) return resp;
    }
  }
  if (env.OPENROUTER_API_KEY) {
    const fallbackModel = "openai/gpt-4o-mini";
    const resp = await openrouterStream({ apiKey: env.OPENROUTER_API_KEY, model: fallbackModel, temperature, messages });
    if (resp) return resp;
  }
  return null;
}

/* ===================================================================== */
/*                            Provider Clients                           */
/* ===================================================================== */

// ---------- Groq (Chat Completion) ----------
async function groqChat({ apiKey, model, temperature, messages, stream }) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature,
      messages,
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
      if (done) {
        controller.enqueue(encodeSSE("event: done\ndata: [DONE]\n\n"));
        controller.close();
        return;
      }
      controller.enqueue(value); // pass chunks through directly
    },
    cancel() {
      try { reader.cancel(); } catch {}
    }
  });
  return new Response(stream, { status: 200, headers });
}

// ---------- OpenRouter (Chat Completion) ----------
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
      model,
      temperature,
      messages,
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
      if (done) {
        controller.enqueue(encoder.encode("event: done\ndata: [DONE]\n\n"));
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel() {
      try { reader.cancel(); } catch {}
    }
  });
  return new Response(stream, { status: 200, headers });
}

/* ===================================================================== */
/*                                Helpers                                */
/* ===================================================================== */

const MEMO = new Map();  // simple in-memory cache

// Models, in order of preference. As of 2026-11 the Groq key only serves the gpt-oss models
// (every Llama model returns model_not_found). GROQ_MODEL (plain env var) can pin a model.
const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile"
];
function pickModel(requested, env) {
  if (env && env.GROQ_MODEL) return env.GROQ_MODEL;
  return (typeof requested === "string" && requested) ? requested : GROQ_MODELS[0];
}
function groqModelChain(model, env) {
  const chain = [model].concat(GROQ_MODELS);
  if (env && env.GROQ_MODEL) chain.unshift(env.GROQ_MODEL);
  return [...new Set(chain)].slice(0, 5);
}

// Only fetch guidance docs from this site or this repo. Anything else falls back to defaults.
function allowUrl(u) {
  if (typeof u !== "string") return null;
  return /^https:\/\/(raw\.githubusercontent\.com\/tonyabdelmalak\/tonyabdelmalak\.github\.io\/|tonyabdelmalak\.com\/)/.test(u) ? u : null;
}

// Accept the widget's { messages } shape or the older { message, history } shape.
// System messages from the client are dropped except the widget's own two control notes,
// so the endpoint can't be used as a general-purpose LLM proxy with a custom prompt.
function sanitizeMessages(body) {
  let list = Array.isArray(body.messages) ? body.messages : [];
  if (!list.length && typeof body.message === "string") {
    list = (Array.isArray(body.history) ? body.history : []).concat([{ role: "user", content: body.message }]);
  }
  return list
    .filter(m => m && typeof m.content === "string" && m.content.trim())
    .filter(m => m.role === "user" || m.role === "assistant" ||
      (m.role === "system" && /^(role_active:|UI already displayed a greeting)/.test(m.content)))
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

// House style: no em dashes in Tony's voice. Also turn the model's non-breaking hyphens and
// narrow spaces back into plain characters so URLs like reflectiv-ai.com copy correctly.
function noEmDash(t) {
  return String(t || "")
    .replace(/[\u2010\u2011]/g, "-").replace(/[\u202f\u00a0]/g, " ")
    .replace(/\s*\u2014\s*/g, ", ").replace(/,\s*,/g, ",").replace(/\s+,/g, ",");
}

async function cachedText(url, ttl = 300) {
  const key = "T:" + url;
  const now = Date.now();
  const hit = MEMO.get(key);
  if (hit && now - hit.t < ttl * 1000) return hit.v;
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`Fetch ${url} ${r.status}`);
  const v = await r.text();
  MEMO.set(key, { v, t: now });
  return v;
}

async function cachedJson(url, ttl = 300) {
  const key = "J:" + url;
  const now = Date.now();
  const hit = MEMO.get(key);
  if (hit && now - hit.t < ttl * 1000) return hit.v;
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`Fetch ${url} ${r.status}`);
  const v = await r.json();
  MEMO.set(key, { v, t: now });
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
  } catch {
    return "- (empty)";
  }
}

function clip(text, maxLen) {
  text = String(text || "");
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

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
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
      ]);
      return result;
    } catch (e) {
      err = e;
    }
  }
  if (err) console.warn("withRetry exhausted:", err.message || err);
  return null;
}

async function safeJson(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, HTTP-Referer, X-Title"
  };
}
function ok204() {
  return new Response(null, { status: 204, headers: cors() });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors() }
  });
}

// SSE encoding helper
const sseEncoder = new TextEncoder();
function encodeSSE(s) {
  return sseEncoder.encode(s);
}
