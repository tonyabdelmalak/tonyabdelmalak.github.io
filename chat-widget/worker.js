// Cloudflare Worker — Tony Chat Backend (GROQ)
// Paste this whole file as worker.js and deploy.

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// ==== Helpers ===============================================================

function json(data, status = 200, cors = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    ...cors,
  });
  return new Response(JSON.stringify(data), { status, headers });
}

function corsHeaders(origin, env) {
  const allow = isOriginAllowed(origin, env) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

function getAllowedOrigins(env) {
  // Comma-separated list in ALLOWED_ORIGINS
  const raw = (env.ALLOWED_ORIGINS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin, env) {
  if (!origin) return false;
  const list = getAllowedOrigins(env);
  return list.includes(origin);
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function buildMessages(userMsg, history = [], system = "") {
  // history may be [{role, content}, ...] from client
  const msgs = [];
  if (system) msgs.push({ role: "system", content: system });

  if (Array.isArray(history)) {
    // keep only last few to stay small
    const trimmed = history.slice(-6);
    for (const m of trimmed) {
      // trust client roles if they look valid; otherwise coerce to user
      if (m && typeof m === "object" && m.role && m.content) {
        msgs.push({ role: m.role, content: String(m.content) });
      }
    }
  }
  if (userMsg) msgs.push({ role: "user", content: String(userMsg) });
  return msgs;
}

// ==== Worker ================================================================

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin") || "";
      const cors = corsHeaders(origin, env);

      // --- Preflight ---
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      // --- Simple health ---
      if (url.pathname === "/health") {
        return json({ ok: true, ts: Date.now() }, 200, cors);
      }

      // --- Introspective config for quick checks ---
      if (url.pathname === "/config") {
        return json(
          {
            allowedOrigins: getAllowedOrigins(env),
            // If you host a system.md file, expose its URL for debugging (optional)
            systemUrl: env.SYSTEM_URL || null,
            // We intentionally hard-lock the model here
            model: "llama-3.1-8b-instant",
            temperature: Number(env.TEMPERATURE ?? 0.2),
          },
          200,
          cors
        );
      }

      // --- Chat endpoint ---
      if (url.pathname === "/chat" && request.method === "POST") {
        if (!isOriginAllowed(origin, env)) {
          return json({ error: "Forbidden origin" }, 403, cors);
        }
        if (!env.GROQ_API_KEY) {
          return json({ error: "Missing GROQ_API_KEY secret" }, 500, cors);
        }

        // Read body with a couple of accepted shapes
        let body = null;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400, cors);
        }

        // Accepted shapes:
        // 1) { message: "hi", history?: [{role,content}], system?: "..."}
        // 2) { messages: [{role,content}...] } (already complete)
        const system = typeof body.system === "string" ? body.system : "";
        const temperature = Number(env.TEMPERATURE ?? 0.2);

        let messages = [];
        if (Array.isArray(body.messages)) {
          messages = body.messages;
        } else {
          const userMsg = body.message || body.input || "";
          const history = Array.isArray(body.history) ? body.history : [];
          messages = buildMessages(userMsg, history, system);
        }

        // Hard-lock to a known good model to avoid env typos
        const model = "llama-3.1-8b-instant";

        // Log what we're about to call (appears in Cloudflare Logs)
        console.log("Groq call", { model, temperature, count: messages.length });

        const groqRes = await fetch(GROQ_ENDPOINT, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature,
            messages,
            stream: false,
          }),
        });

        if (!groqRes.ok) {
          // Loud error logging: status + raw body
          const raw = await groqRes.text().catch(() => "");
          console.error("GroqError", groqRes.status, raw);

          // Try to parse JSON for client; fall back to raw
          let detail;
          try {
            detail = JSON.parse(raw);
          } catch {
            detail = raw;
          }
          return json(
            { error: "GROQ", status: groqRes.status, detail },
            502,
            cors
          );
        }

        const data = await safeJson(groqRes);
        const reply =
          data?.choices?.[0]?.message?.content ??
          data?.choices?.[0]?.message ??
          "";

        return json(
          {
            reply,
            model,
            usage: data?.usage || null,
          },
          200,
          cors
        );
      }

      // Fallback: 404
      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      console.error("Worker crash", err && err.stack ? err.stack : String(err));
      return json({ error: "Server error" }, 500, { "Content-Type": "application/json" });
    }
  },
};
