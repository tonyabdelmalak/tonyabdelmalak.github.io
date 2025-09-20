export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin") || "";
      const cors = corsHeaders(origin, env);

      // Preflight
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      // Health + config (handy for debugging)
      if (url.pathname === "/health") {
        return json({ ok: true, ts: Date.now() }, 200, cors);
      }
      if (url.pathname === "/config") {
        return json({
          allowedOrigins: getAllowedOrigins(env),
          systemUrl: env.SYSTEM_URL || null,
          model: env.GROQ_MODEL || "llama-3.1-70b-versatile",
          temperature: Number(env.TEMPERATURE ?? 0.2)
        }, 200, cors);
      }

      // Chat endpoint
      if (url.pathname === "/chat" && request.method === "POST") {
        if (!isOriginAllowed(origin, env)) {
          return json({ error: "Forbidden origin" }, 403, cors);
        }
        if (!env.GROQ_API_KEY) {
          return json({ error: "Missing GROQ_API_KEY secret" }, 500, cors);
        }

        const body = await safeJson(request);
        const userMsg = (body?.message || "").toString().trim();
        const history = Array.isArray(body?.history) ? body.history : [];
        if (!userMsg) return json({ error: "Missing 'message'." }, 400, cors);

        // Load system.md (guardrails)
        const systemUrl = env.SYSTEM_URL || "";
        let systemFromUrl = "";
        if (systemUrl) {
          try {
            const r = await fetch(systemUrl, { cf: { cacheTtl: 600, cacheEverything: true } });
            if (r.ok) systemFromUrl = await r.text();
          } catch (_) {}
        }

        const hardRules = [
          "You are Tony’s portfolio assistant.",
          "Only answer with facts that are in the system message or clearly stated by the user.",
          "If unsure, say you’re not sure and offer to open the relevant page on tonyabdelmalak.github.io.",
          "Be concise, specific, and professional; avoid speculation."
        ].join(" ");

        const system = [hardRules, systemFromUrl && "\n--- SYSTEM.md ---\n" + systemFromUrl]
          .filter(Boolean).join("\n");

        // Normalize history (‘ai’ -> ‘assistant’)
        const mapped = history
          .filter(m => m && typeof m.content === "string")
          .map(m => ({
            role: m.role === "ai" ? "assistant" : (m.role === "assistant" ? "assistant" : "user"),
            content: m.content
          }));

        const messages = [
          { role: "system", content: system },
          ...mapped.slice(-6),
          { role: "user", content: userMsg }
        ];

        const model = env.GROQ_MODEL || "llama-3.1-70b-versatile";
        const temperature = Number(env.TEMPERATURE ?? 0.2);

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model, temperature, messages, stream: false
          })
        });

        if (!groqRes.ok) {
          const e = await safeJson(groqRes);
          return json({ error: "GROQ error", detail: e }, 502, cors);
        }

        const data = await groqRes.json();
        const reply = (data?.choices?.[0]?.message?.content || "").trim();

        return json({ reply }, 200, cors);
      }

      return new Response("Not found", { status: 404, headers: cors });
    } catch (err) {
      return new Response("Server error", { status: 500 });
    }
  }
};

/* ---------- helpers ---------- */
function getAllowedOrigins(env) {
  const raw = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  return raw.length ? raw : ["*"];
}
function isOriginAllowed(origin, env) {
  const allowed = getAllowedOrigins(env);
  if (allowed.includes("*")) return true;
  return allowed.some(a => a === origin);
}
function corsHeaders(origin, env) {
  const allow = isOriginAllowed(origin, env) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow || "https://tonyabdelmalak.github.io",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Max-Age": "86400"
  };
}
async function safeJson(resOrReq) { try { return await resOrReq.json(); } catch { return null; } }
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}
