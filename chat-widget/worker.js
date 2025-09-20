// worker.js — Cloudflare Worker for GROQ chat with strict CORS + persona support

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin") || "";
      const cors = buildCorsHeaders(origin, env);

      // Preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "content-type, authorization",
            "Access-Control-Max-Age": "86400"
          }
        });
      }

      // Health
      if (url.pathname === "/health") {
        return json({ ok: true, ts: Date.now() }, 200, cors);
      }

      // Config
      if (url.pathname === "/config") {
        return json(
          {
            allowedOrigins: getAllowedOrigins(env),
            model: env.GROQ_MODEL || "llama-3.1-8b-instant",
            temperature: Number(env.TEMPERATURE ?? 0.2),
          },
          200,
          cors
        );
      }

      // Chat
      if (url.pathname === "/chat" && request.method === "POST") {
        if (!isOriginAllowed(origin, env)) {
          return json({ error: "Forbidden origin", origin }, 403, cors);
        }
        if (!env.GROQ_API_KEY) {
          return json({ error: "Missing GROQ_API_KEY secret" }, 500, cors);
        }

        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400, cors);
        }

        const userMsg = (body?.message ?? "").toString().slice(0, 4000);
        const system   = (body?.system  ?? "").toString().slice(0, 12000); // <— persona
        const history  = Array.isArray(body?.history) ? body.history.slice(-6) : [];

        if (!userMsg) {
          return json({ error: "Empty message" }, 400, cors);
        }

        const messages = [];
        if (system) messages.push({ role: "system", content: system }); // persona injected here
        for (const m of history) {
          if (m && typeof m === "object" && typeof m.content === "string" && m.role) {
            messages.push({ role: m.role, content: m.content });
          }
        }
        messages.push({ role: "user", content: userMsg });

        const model = env.GROQ_MODEL || "llama-3.1-8b-instant";
        const temperature = Number(env.TEMPERATURE ?? (typeof body.temperature === 'number' ? body.temperature : 0.2));

        let groqRes;
        try {
          groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.GROQ_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              temperature,
              messages,
              stream: false
            })
          });
        } catch (err) {
          return json({ error: "Network to GROQ failed", detail: String(err) }, 502, cors);
        }

        if (!groqRes.ok) {
          const detail = await safeJson(groqRes);
          return json({ error: "GROQ error", status: groqRes.status, detail }, 502, cors);
        }

        const data = await groqRes.json();
        const text =
          data?.choices?.[0]?.message?.content ??
          data?.choices?.[0]?.text ?? "";

        return json({ text }, 200, cors);
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      return new Response(JSON.stringify({ error: "Worker crashed", detail: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  },
};

/* ---------------- helpers ---------------- */

function getAllowedOrigins(env) {
  const raw = (env.ALLOWED_ORIGINS || "").trim();
  if (!raw) return [];
  return raw.split(/[, \n]+/).map(s => s.trim()).filter(Boolean);
}

function isOriginAllowed(origin, env) {
  if (!origin) return false;
  return getAllowedOrigins(env).includes(origin);
}

function buildCorsHeaders(origin, env) {
  const headers = { "Vary": "Origin" };
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
  try { return await res.json(); }
  catch {
    try { return await res.text(); }
    catch { return null; }
  }
}
