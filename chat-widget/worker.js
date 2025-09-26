// worker.js — Copilot proxy (Groq first, OpenAI fallback)

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/chat" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        const userMsg = (body?.message || "").toString().trim();
        const history = Array.isArray(body?.history) ? body.history : [];
        const clientSystem = (body?.system || "").toString().trim();

        if (!userMsg) {
          return new Response(JSON.stringify({ error: "Missing 'message'." }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() }
          });
        }

        const hasOpenAI = !!env.OPENAI_API_KEY;       // <-- correct env name
        const hasGroq   = !!env.GROQ_API_KEY;

        if (!hasOpenAI && !hasGroq) {
          return new Response(JSON.stringify({ error: "No model provider configured." }), {
            status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() }
          });
        }

        // Prefer client system prompt; fallback to concise built-in
        const FALLBACK_SYSTEM = (
          "You are Tony speaking in first person. Be concise (≤60 words), warm, and expert. " +
          "Help with background, dashboards, and projects. No private/sensitive info. " +
          "If unsure, say so and ask one focused question."
        );
        const systemPrompt = clientSystem || FALLBACK_SYSTEM;

        const past = history
          .filter(m => m && m.role && m.content)
          .map(m => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-12);

        const messages = [
          { role: "system", content: systemPrompt },
          ...past,
          { role: "user", content: userMsg }
        ];

        // Use client-provided model/temperature if given (safe defaults)
        const model = (body?.model || "llama-3.1-8b-instant").toString();
        const temperature = Number.isFinite(+body?.temperature) ? +body.temperature : 0.2;

        let apiUrl, headers, payload;

        if (hasGroq) {
          apiUrl = "https://api.groq.com/openai/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          };
          payload = { model, messages, temperature, max_tokens: 400 };
        } else {
          apiUrl = "https://api.openai.com/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,   // <-- fixed
            "Content-Type": "application/json",
          };
          payload = { model: "gpt-4o-mini", messages, temperature, max_tokens: 400 };
        }

        const resp = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify(payload) });

        if (!resp.ok) {
  const txt = await resp.text();
  return new Response(
    JSON.stringify({
      error: "Upstream error",
      status: resp.status,
      details: txt    // <-- keep the provider’s message
    }),
    { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
  );
}

        const data = await resp.json();
        const reply = data?.choices?.[0]?.message?.content?.trim() || "Sorry—no response was generated.";

        return new Response(JSON.stringify({ reply }), {
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Server error", details: String(err) }), {
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() }
        });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};
