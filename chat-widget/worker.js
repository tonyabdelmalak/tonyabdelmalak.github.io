// worker.js — Cloudflare Worker (Module syntax)
// Paste this entire file into your Worker and deploy.
// Expects environment variables: OPENAI_API_KEY (required), GROQ_API_KEY (optional)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- CORS (preflight) ---
    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    // --- Health check ---
    if (url.pathname === "/" && request.method === "GET") {
      return cors(json({ ok: true, service: "tony-copilot-worker" }));
    }

    // --- Chat endpoint ---
    if (url.pathname === "/chat" && request.method === "POST") {
      try {
        const body = await safeJson(request);
        const messages = Array.isArray(body?.messages) ? body.messages : [];

        if (!messages.length) {
          return cors(json({ error: "Missing messages[]" }, 400));
        }

        // Optional system message support
        const systemPrompt =
          typeof body?.systemPrompt === "string" && body.systemPrompt.trim()
            ? body.systemPrompt.trim()
            : null;

        const finalMessages = systemPrompt
          ? [{ role: "system", content: systemPrompt }, ...messages]
          : messages;

        // Try OpenAI first; fall back to Groq if configured
        let replyText = null;

        if (env.OPENAI_API_KEY) {
          const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: finalMessages,
              temperature: clamp(body.temperature, 0, 1, 0.3),
              max_tokens: clamp(body.max_tokens, 1, 800, 300),
            }),
          });

          const openaiJson = await openaiRes.json().catch(() => ({}));
          replyText =
            openaiJson?.choices?.[0]?.message?.content ??
            openaiJson?.reply ??
            null;

          if (replyText) {
            return cors(json({ reply: replyText, provider: "openai" }));
          }
        }

        if (env.GROQ_API_KEY) {
          const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model: "llama-3.1-8b-instant",
              messages: finalMessages,
              temperature: clamp(body.temperature, 0, 1, 0.3),
              max_tokens: clamp(body.max_tokens, 1, 800, 300),
            }),
          });

          const groqJson = await groqRes.json().catch(() => ({}));
          replyText =
            groqJson?.choices?.[0]?.message?.content ??
            groqJson?.reply ??
            null;

          if (replyText) {
            return cors(json({ reply: replyText, provider: "groq" }));
          }

          return cors(json({ error: "No reply from Groq", details: groqJson }, 502));
        }

        return cors(
          json(
            {
              error:
                "No provider configured. Set OPENAI_API_KEY (preferred) or GROQ_API_KEY in Worker settings.",
            },
            500,
          ),
        );
      } catch (err) {
        return cors(
          json(
            {
              error: "Unhandled error",
              details: String(err?.stack || err),
            },
            500,
          ),
        );
      }
    }

    // --- Not found ---
    return cors(json({ error: "Not found" }, 404));
  },
};

// ---------- helpers ----------
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function cors(res) {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "*");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(res.body, { status: res.status, headers });
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function clamp(val, min, max, fallback) {
  const n = Number(val);
  if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
  return fallback;
}
