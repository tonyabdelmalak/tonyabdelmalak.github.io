export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") return withCORS(new Response(null, { status: 204 }), req, env);

    if (url.pathname === "/") return new Response("Tony chat worker OK", { status: 200 });

    if (url.pathname === "/chat" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        const user = (body.message || "").trim();
        const historyIn = Array.isArray(body.history) ? body.history : [];

        if (!user) return withCORS(json({ error: "Missing 'message' string" }, 400), req, env);

        // Pull & cache system.md (server-side guardrails)
        const systemMd = await getSystemMd(env.SYSTEM_MD_URL);

        const systemPrompt = [
          systemMd,
          "",
          "----- STRICT ANSWERING RULES -----",
          "You are Tony’s site assistant.",
          "Only answer with facts present in the system message or clearly derived from the user’s text.",
          "If you’re not sure, say: “I don’t have that info yet, but I can link you to Tony’s portfolio.”",
          "Be concise and specific; keep marketing fluff out."
        ].join("\n");

        // Normalize history from UI: roles may be 'user' | 'ai'
        const normalized = historyIn
          .slice(-6)
          .map(m => ({
            role: m.role === "ai" ? "assistant" : (m.role === "assistant" ? "assistant" : "user"),
            content: String(m.content || "")
          }))
          .filter(m => m.content);

        const messages = [
          { role: "system", content: systemPrompt },
          ...normalized,
          { role: "user", content: user }
        ];

        const provider = (env.PROVIDER || "openai").toLowerCase();
        const model = env.MODEL || "gpt-4o-mini";

        const reply = provider === "groq"
          ? await callGroq(env, model, messages)
          : await callOpenAI(env, model, messages);

        return withCORS(json({ reply: (reply || "I don’t have that info yet, but I can link you to Tony’s portfolio.").trim() }), req, env);
      } catch (e) {
        console.error("[worker] /chat error", e);
        return withCORS(json({ error: "Server error" }, 500), req, env);
      }
    }

    return new Response("Not found", { status: 404 });
  }
};

async function getSystemMd(url) {
  if (!url) return "You are Tony’s assistant.";
  const cache = caches.default;
  const req = new Request(url, { cf: { cacheTtl: 3600 } });
  let res = await cache.match(req);
  if (!res) {
    const f = await fetch(url, { headers: { "User-Agent": "tony-chat-worker" } });
    if (!f.ok) throw new Error("system.md fetch failed: " + f.status);
    res = new Response(await f.text(), { headers: { "Cache-Control": "public, max-age=3600" } });
    await cache.put(req, res.clone());
  }
  return await res.text();
}

async function callOpenAI(env, model, messages) {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.1, top_p: 1, messages })
  });
  if (!r.ok) throw new Error("OpenAI error: " + (await r.text()));
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

async function callGroq(env, model, messages) {
  const key = env.GROQ_API_KEY;
  if (!key) throw new Error("Missing GROQ_API_KEY");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.1, top_p: 1, messages })
  });
  if (!r.ok) throw new Error("Groq error: " + (await r.text()));
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

function withCORS(res, req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim());
  const allow = allowed.includes(origin) ? origin : allowed[0] || "*";
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", allow);
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, headers: h });
}
