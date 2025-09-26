
// worker.js — Copilot proxy (Groq first, OpenAI fallback)

const SYSTEM_PROMPT = `
I am Tony — a friendly, concise guide who's happy to answer any questions you have. 
Priorities:
1) Help visitors understand my work, dashboards, and background.
2) If asked for private/sensitive info, decline and point to public resources.
3) Keep replies brief (≤60 words) unless returning code. Use short sentences/bullets.
4) No medical/legal/financial advice—suggest a professional.

Style: Warm, expert, no fluff. If unsure, say so. One smart follow-up max.

Background:
I am a People & Business Insights Analyst who pivoted into AI-driven HR analytics.
I use Tableau, SQL, and Python to turn workforce/business data into exec-ready insights.
Projects include turnover analysis, early turnover segmentation, and workforce planning models.
I'm based in Los Angeles and aim to lead AI initiatives in HR analytics.
`.trim();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",                    // lock to your domain later
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Chat endpoint
    if (url.pathname === "/chat" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));

        const userMsg = (body?.message || "").toString().trim();
        if (!userMsg) {
          return new Response(JSON.stringify({ error: "Missing 'message' in request body." }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        // Honor widget-provided persona + model settings
        const clientSystem = (body?.system || "").toString().trim();
        const systemPrompt = clientSystem || SYSTEM_PROMPT;

        const model = (body?.model || "llama-3.1-8b-instant").toString();
        const temperature = Number.isFinite(+body?.temperature) ? +body.temperature : 0.2;

        // Trim/normalize history (optional)
        const history = Array.isArray(body?.history) ? body.history : [];
        const past = history
          .filter((m) => m && m.role && m.content)
          .map((m) => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-12);

        const messages = [
          { role: "system", content: systemPrompt },
          ...past,
          { role: "user", content: userMsg },
        ];

        // Provider selection
        const hasOpenAI = !!env.OPENAI_API_KEY;   // <-- fixed case
        const hasGroq   = !!env.GROQ_API_KEY;

        if (!hasOpenAI && !hasGroq) {
          return new Response(
            JSON.stringify({ error: "No model provider configured (set OPENAI_API_KEY or GROQ_API_KEY)." }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

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
          // Pick a small/cheap default; override via body.model if you want
          payload = { model: "gpt-4o-mini", messages, temperature, max_tokens: 400 };
        }

        const resp = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const txt = await resp.text();
          // Shape error so the widget shows the real reason (rate limit, invalid model, auth, etc.)
          return new Response(
            JSON.stringify({
              detail: { error: { message: txt } },
              error: "Upstream error",
              status: resp.status,
            }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        const data = await resp.json();
        const reply =
          data?.choices?.[0]?.message?.content?.trim() ||
          "Sorry—no response was generated.";

        return new Response(JSON.stringify({ reply }), {
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: "Server error", details: String(err) }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};
