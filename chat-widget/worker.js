// worker.js — Cloudflare Worker (Modules)
// Set environment variables in Cloudflare dashboard:
//  - OPENAI_API_KEY (required, if using OpenAI)
//  - GROQ_API_KEY   (optional, fallback)

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return withCORS(new Response(null, { status: 204 }));
    }

    // Health check
    if (pathname === "/" && request.method === "GET") {
      return withCORS(json({ ok: true, name: "tony-copilot-worker" }));
    }

    // Chat endpoint
    if (pathname === "/chat" && request.method === "POST") {
      try {
        const body = await safeJson(request);
        const userMessages = Array.isArray(body?.messages) ? body.messages : [];
        const system = typeof body?.system === "string" && body.system.trim() ? body.system.trim() : null;

        if (!userMessages.length) {
          return withCORS(json({ error: "Missing messages[]" }, 400));
        }

        const messages = system
          ? [{ role: "system", content: system }, ...userMessages]
          : userMessages;

        // Try OpenAI first
        if (env.OPENAI_API_KEY) {
          const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "authorization": `Bearer ${env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages,
              temperature: clamp(body.temperature, 0, 1, 0.3),
              max_tokens: clamp(body.max_tokens, 1, 800, 300)
            })
          });
          const j = await r.json().catch(() => ({}));
          const reply = j?.choices?.[0]?.message?.content || j?.reply || null;
          if (reply) return withCORS(json({ reply, provider: "openai" }));
        }

        // Fallback to Groq if provided
        if (env.GROQ_API_KEY) {
          const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "authorization": `Bearer ${env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
              model: "llama-3.1-8b-instant",
              messages,
              temperature: clamp(body.temperature, 0, 1, 0.3),
              max_tokens: clamp(body.max_tokens, 1, 800, 300)
            })
          });
          const j = await r.json().catch(() => ({}));
          const reply = j?.choices?.[0]?.message?.content || j?.reply || null;
          if (reply) return withCORS(json({ reply, provider: "groq" }));
          return withCORS(json({ error: "No reply from Groq", details: j }, 502));
        }

        return withCORS(json({ error: "No provider configured (set OPENAI_API_KEY or GROQ_API_KEY)" }, 500));
      } catch (err) {
        return withCORS(json({ error: "Unhandled error", details: String(err?.stack || err) }, 500));
      }
    }

    return withCORS(json({ error: "Not found" }, 404));
  }
};

// ---- helpers ----
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function withCORS(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "*");
  h.set("Access-Control-Max-Age", "86400");
  return new Response(res.body, { status: res.status, headers: h });
}

async function safeJson(req) {
  try { return await req.json(); } catch { return {}; }
}

function clamp(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
