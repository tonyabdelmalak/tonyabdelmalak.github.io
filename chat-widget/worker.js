// worker.js — Copilot proxy (Groq first, fallback to OpenAI)
// - CORS unchanged (wildcard) to avoid "Failed to fetch"
// - Groq FIRST (even if OPENAI_API_KEY exists); fallback to OpenAI only if GROQ_API_KEY missing
// - Accepts optional client "system" (system.md) and merges with your SYSTEM_PROMPT
// - Tiny first-person hint to keep voice in "I/my" without risky post-processing

const SYSTEM_PROMPT = `
You are Tony’s Copilot — a friendly, concise guide for tonyabdelmalak.github.io.
Priorities:
1) Help visitors understand Tony’s work, dashboards, and background.
2) If asked for private/sensitive info, decline and point to public resources.
3) Keep replies brief (≤60 words) unless returning code. Use short sentences/bullets.
4) No medical/legal/financial advice—suggest a professional.

Style: Warm, expert, no fluff. If unsure, say so. One smart follow-up max.

Background:
Tony Abdelmalak is a People & Business Insights Analyst who pivoted into AI-driven HR analytics.
He uses Tableau, SQL, and Python to turn workforce/business data into exec-ready insights.
Projects include turnover analysis, early turnover segmentation, and workforce planning models.
He’s based in Los Angeles and aims to lead AI initiatives in HR analytics.
`.trim();

const FIRST_PERSON_HINT = `Speak as Tony in first person ("I", "my") and never refer to Tony in the third person.`;

// --- CORS (unchanged) ---
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

    // Health
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // Preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Chat
    if (url.pathname === "/chat" && req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        const userMsg = (body?.message || body?.input || "").toString().trim();
        const history = Array.isArray(body?.history) ? body.history : [];
        const systemFromClient = (body?.system || "").toString().trim(); // optional persona from widget

        if (!userMsg) {
          return new Response(
            JSON.stringify({ error: "Missing 'message' in request body." }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        // Provider selection: GROQ FIRST, then OpenAI
        const groqKey = env.GROQ_API_KEY;
        const openaiKey = env.OPENAI_API_KEY || env.OpenAI_API_KEY; // tolerate mis-casing
        const hasGroq = !!groqKey;
        const hasOpenAI = !!openaiKey;

        if (!hasGroq && !hasOpenAI) {
          return new Response(
            JSON.stringify({ error: "No model provider configured (set GROQ_API_KEY or OPENAI_API_KEY)." }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        // Normalize history
        const past = history
          .filter(m => m && m.role && m.content)
          .map(m => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-12);

        // Merge system prompts (your base + optional client persona + first-person hint)
        const mergedSystem = [SYSTEM_PROMPT, systemFromClient, FIRST_PERSON_HINT]
          .filter(Boolean)
          .join("\n\n");

        const messages = [
          { role: "system", content: mergedSystem },
          ...past,
          { role: "user", content: userMsg }
        ];

        // Optional client hints; keep safe defaults
        const clientModel = (body?.model || "").toString().trim();
        const clientTemp = typeof body?.temperature === "number" ? body.temperature : undefined;
        const temperature = typeof clientTemp === "number" ? clientTemp : 0.3;
        const max_tokens = typeof body?.max_tokens === "number" ? body.max_tokens : 200;

        // Build upstream request (GROQ first)
        let apiUrl, headers, payload;
        if (hasGroq) {
          apiUrl = "https://api.groq.com/openai/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          };
          payload = {
            model: clientModel || "llama-3.1-8b-instant",
            messages,
            temperature,
            max_tokens,
          };
        } else {
          apiUrl = "https://api.openai.com/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          };
          payload = {
            model: clientModel || "gpt-4o-mini",
            messages,
            temperature,
            max_tokens,
          };
        }

        const resp = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const txt = await resp.text();
          return new Response(
            JSON.stringify({ error: "Upstream error", status: resp.status, details: txt }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        const data = await resp.json();
        const reply =
          data?.choices?.[0]?.message?.content?.trim() ||
          data?.choices?.[0]?.text?.trim() ||
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

    return new Response("Not found", { status: 404 });
  },
};
