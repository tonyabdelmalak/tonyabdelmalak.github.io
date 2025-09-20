// worker.js — Cloudflare Worker for GROQ chat with strict CORS

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin") || "";
      const cors = buildCorsHeaders(origin, env);

      // ---- Handle preflight (CORS) ----
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "content-type",
            "Access-Control-Max-Age": "86400",
          },
        });
      }

      // ---- Health ----
      if (url.pathname === "/health") {
        return json({ ok: true, ts: Date.now() }, 200, cors);
      }

      // ---- Introspective config (quick debug) ----
      if (url.pathname === "/config") {
        return json(
          {
            allowedOrigins: getAllowedOrigins(env),
            systemUrl: env.SYSTEM_URL || null, // optional
            // Hard-lock or change via env.GROQ_MODEL
            model: env.GROQ_MODEL || "llama-3.1-8b-instant",
            temperature: Number(env.TEMPERATURE ?? 0.2),
          },
          200,
          cors
        );
      }

      // ---- Chat endpoint ----
      if (url.pathname === "/chat" && request.method === "POST") {
        // 1) CORS gate
        if (!isOriginAllowed(origin, env)) {
          return json({ error: "Forbidden origin", origin }, 403, cors);
        }

        // 2) Secrets gate
        if (!env.GROQ_API_KEY) {
          return json({ error: "Missing GROQ_API_KEY secret" }, 500, cors);
        }

        // 3) Parse body
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400, cors);
        }

        const userMsg = (body?.message ?? "").toString().slice(0, 4000);
        const system = (body?.system ?? "").toString().slice(0, 4000);
        const history = Array.isArray(body?.history) ? body.history : [];

        const messages = [
          { role: "system", content: system },
          ...history.slice(-6),
          { role: "user", content: userMsg },
        ];

        const model = env.GROQ_MODEL || "llama-3.1-8b-instant";
        const temperature = Number(env.TEMPERATURE ?? 0.2);

        // 4) Call GROQ
        let groqRes;
        try {
          groqRes = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.GROQ_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages,
                temperature,
                stream: false,
              }),
            }
          );
        } catch (err) {
          // Network/DNS TLS issues (browser would show “failed”)
          return json(
            { error: "Network to GROQ failed", detail: `${err}` },
            502,
            cors
          );
        }

        // 5) Non-2xx from GROQ — bubble up the JSON so we can see it
        if (!groqRes.ok) {
          const detail = await safeJson(groqRes);
          return json(
            {
              error: "GROQ error",
              status: groqRes.status,
              detail,
            },
            502,
            cors
          );
        }

        // 6) OK — extract model reply
        const data = await groqRes.json();
        const text =
          data?.choices?.[0]?.message?.content ??
          data?.choices?.[0]?.text ??
          "";
        return json({ text }, 200, cors);
      }

      // ---- Fallback ----
      return json({ error: "Not found" }, 404, buildCorsHeaders("", env));
    } catch (err) {
      // Top-level guardrail
      return new Response(
        JSON.stringify({ error: "Worker crashed", detail: `${err}` }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};

/* ---------------- helpers ---------------- */

function getAllowedOrigins(env) {
  // Plain text variable in Cloudflare: ALLOWED_ORIGINS
  // Example: https://tonyabdelmalak.com, https://www.tonyabdelmalak.com, https://tonyabdelmalak.github.io
  const raw = (env.ALLOWED_ORIGINS || "").trim();
  if (!raw) return [];
  return raw
    .split(/[, \n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin, env) {
  if (!origin) return false;
  const allowed = getAllowedOrigins(env);
  return allowed.includes(origin);
}

function buildCorsHeaders(origin, env) {
  // Echo the origin only if it’s in the allowlist.
  const headers = {
    "Vary": "Origin",
  };
  if (origin && isOriginAllowed(origin, env)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return null;
    }
  }
}
