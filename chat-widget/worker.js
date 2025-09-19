// worker.js — Copilot proxy (OpenAI first, fallback to Groq) with 429 backoff + model pool
// CORS fixed: allow-list specific origins (GitHub Pages + custom domain), handle OPTIONS properly,
// and echo the allowed Origin instead of "*". Also preserves your persona/logic.

const ALLOWED_ORIGINS = new Set([
  "https://tonyabdelmalak.github.io",
  "https://tonyabdelmalak.com",        // keep if/when you point this domain
  // "http://127.0.0.1:5500",          // uncomment for local testing
  // "http://localhost:8787",          // uncomment if testing via wrangler dev
]);

/* ---------------- Persona & Style (UNCHANGED) ---------------- */
const SYSTEM_PROMPT = `...` .trim(); // ← keep your long SYSTEM_PROMPT exactly as you pasted
const STYLE_ADDENDUM = `
FORMAT RULES (hard):
- Max 70 words unless user asks for more.
- No markdown headings, no lists, no section titles, no code blocks.
- Lead with the answer in 1–2 short sentences.
- Then up to 3 short bullets (optional).
- End with exactly ONE follow-up question on a new line, prefixed with "→ ".
- Keep it warm and plain; no résumé-speak, no buzzwords.
`.trim();

/* ---------------------- Utilities ---------------------- */
function corsHeadersFor(origin) {
  // If the request's Origin is on the allow-list, echo it back. Otherwise, do not set ACAO.
  const h = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Vary": "Origin", // caches behave correctly per-origin
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function requireAllowedOrigin(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: "Forbidden: origin not allowed", origin }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

function clamp(n, min, max) { n = Number(n); if (Number.isNaN(n)) return min; return Math.max(min, Math.min(max, n)); }
function mergeSystem(...parts) { return parts.filter(Boolean).map(s => String(s).trim()).join("\n\n---\n"); }

let SYSTEM_CACHE = { text: null, ts: 0 };
const SYSTEM_TTL_MS = 5 * 60 * 1000;

async function fetchSystemFromUrl(env) {
  const url = env?.SYSTEM_URL;
  const now = Date.now();
  if (!url) return "";
  if (SYSTEM_CACHE.text && now - SYSTEM_CACHE.ts < SYSTEM_TTL_MS) return SYSTEM_CACHE.text;
  try {
    const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) return "";
    const text = await res.text();
    SYSTEM_CACHE = { text, ts: now };
    return text || "";
  } catch { return ""; }
}

async function fetchWithBackoff(url, init, { attempts = 3, initialDelayMs = 1000 } = {}) {
  let delay = initialDelayMs, lastRes = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    lastRes = res;
    const retryAfter = res.headers.get("retry-after");
    const waitMs = retryAfter ? Number(retryAfter) * 1000 : delay;
    await new Promise(r => setTimeout(r, waitMs));
    delay *= 2;
  }
  return lastRes || fetch(url, init);
}

async function readErrorSafely(res) { try { return await res.json(); } catch {} try { return await res.text(); } catch {} return "Unknown error"; }
function trimHistory(history, maxTurns = 12) {
  return (Array.isArray(history) ? history : [])
    .filter(m => m && m.role && m.content)
    .map(m => ({ role: m.role, content: String(m.content).trim() }))
    .slice(-maxTurns);
}

function sanitizeReply(text) {
  if (!text) return "";
  let s = String(text)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  s = s.replace(/^\s*[-*+]\s+/gm, "• ");
  const lines = s.split("\n").map(l => l.trim()).filter(Boolean);
  const out = []; let bulletCount = 0; let seenFollow = false;
  for (const line of lines) {
    if (line.startsWith("• ")) { if (bulletCount < 3) { out.push(line); bulletCount++; } continue; }
    if (/^→\s/.test(line)) { if (!seenFollow) { out.push(line); seenFollow = true; } continue; }
    out.push(line);
  }
  return out.join("\n").trim();
}

/* ---------------------- Main Worker ---------------------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin");

    // Health
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json", ...corsHeadersFor(origin) },
      });
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
      // Only acknowledge preflight for allowed origins
      const forbidden = requireAllowedOrigin(origin);
      if (forbidden) return forbidden;
      return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
    }

    // Chat endpoint
    if (url.pathname === "/chat" && req.method === "POST") {
      const forbidden = requireAllowedOrigin(origin);
      if (forbidden) return forbidden;

      try {
        const body = await req.json().catch(() => ({}));
        const userMsg = String(body?.message ?? "").trim();
        if (!userMsg) {
          return new Response(JSON.stringify({ error: "Missing 'message' in request body." }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeadersFor(origin) }
          });
        }

        const history = trimHistory(body?.history, clamp(body?.max_history_turns ?? 12, 0, 40));
        const clientSystem = body?.system ? String(body.system) : "";
        const fetchedSystem = clientSystem ? "" : await fetchSystemFromUrl(env);
        const temperature = clamp(body?.temperature ?? 0.3, 0, 2);
        const max_tokens = clamp(body?.max_tokens ?? 160, 32, 1024);
        const preferredModel = body?.model && String(body.model);
        const modelPool = Array.isArray(body?.model_pool) && body.model_pool.length
          ? body.model_pool.map(String)
          : ["llama-3.1-8b-instant", "llama-3.1-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"];

        const mergedSystem = mergeSystem(SYSTEM_PROMPT, STYLE_ADDENDUM, clientSystem || fetchedSystem);
        const messages = [{ role: "system", content: mergedSystem }, ...history, { role: "user", content: userMsg }];

        const hasOpenAI = !!env.OPENAI_API_KEY;
        const hasGroq = !!env.GROQ_API_KEY;
        if (!hasOpenAI && !hasGroq) {
          return new Response(JSON.stringify({ error: "No model provider configured (set OPENAI_API_KEY or GROQ_API_KEY)." }), {
            status: 500, headers: { "Content-Type": "application/json", ...corsHeadersFor(origin) }
          });
        }

        // Try OpenAI first
        if (hasOpenAI) {
          const openaiPayload = { model: preferredModel || "gpt-4o-mini", messages, temperature, max_tokens };
          const res = await fetchWithBackoff("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(openaiPayload),
          }, { attempts: 3, initialDelayMs: 1000 });

          if (res.ok) {
            const data = await res.json();
            const rawReply = data?.choices?.[0]?.message?.content?.trim() || "Sorry—no response was generated.";
            const reply = sanitizeReply(rawReply);
            return new Response(JSON.stringify({ reply }), {
              headers: { "Content-Type": "application/json", ...corsHeadersFor(origin) },
            });
          }

          const errDetails = await readErrorSafely(res);
          if (res.status !== 429 && (res.status < 500 || res.status >= 600)) {
            return new Response(JSON.stringify({
              error: "Upstream error (OpenAI)", status: res.status, details: errDetails,
              userMessage: "I’m a bit busy right now — try again in a moment."
            }), { status: 502, headers: { "Content-Type": "application/json", ...corsHeadersFor(origin) } });
          }
          // else fall through to Groq
        }

        // Groq fallback
        if (hasGroq) {
          const groqHeaders = { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" };
          const pool = preferredModel ? [preferredModel, ...modelPool.filter(m => m !== preferredModel)] : modelPool;
          let last429 = null;

          for (const model of pool) {
            const groqPayload = { model, messages, temperature, max_tokens };
            const res = await fetchWithBackoff("https://api.groq.com/openai/v1/chat/completions",
              { method: "POST", headers: groqHeaders, body: JSON.stringify(groqPayload) },
              { attempts: 3, initialDelayMs: 1000 });

            if (res.ok) {
              const data = await res.json();
              const rawReply = data?.choices?.[0]?.message?.content?.trim() || "Sorry—no response was generated.";
              const reply = sanitizeReply(rawReply);
              return new Response(JSON.stringify({ reply }), {
                headers: { "Content-Type": "application/json", ...corsHeadersFor(origin) },
              });
            }

            if (res.status === 429) { last429 = await readErrorSafely(res); continue; }

            const otherErr = await readErrorSafely(res);
            return new Response(JSON.stringify({
              error: "Upstream error (Groq)", status: res.status, details: otherErr,
              userMessage: "I’m running into an upstream error. Try again shortly."
            }), { status: 502, headers: { "Content-Type": "application/json", ...corsHeadersFor(origin) } });
          }

          return new Response(JSON.stringify({
            error: "rate_limited", status: 429, details: last429 || "Rate limit across models",
            userMessage: "I’m getting a lot of requests at once. Give me a few seconds and try again — or shorten your prompt."
          }), { status: 429, headers: { "Content-Type": "application/json", ...corsHeadersFor(origin) } });
        }

        return new Response(JSON.stringify({
          error: "No provider available after retries",
          userMessage: "I’m having trouble reaching the model right now. Try again in a moment."
        }), { status: 502, headers: { "Content-Type": "application/json", ...corsHeadersFor(origin) } });

      } catch (err) {
        return new Response(JSON.stringify({
          error: "Server error", details: String(err),
          userMessage: "Something went wrong on my side. Please try again."
        }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeadersFor(origin) } });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
