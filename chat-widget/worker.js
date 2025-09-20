// worker.js — Copilot proxy (Groq first, fallback to OpenAI)
// Minimal, safe upgrades:
// - Accepts client "system" (from widget system.md) and merges with SYSTEM_PROMPT
// - Light first-person nudge (no post-processing)
// - Optional client model/temperature hints
// - Keeps your CORS and routing identical
// - Robust OpenAI key lookup (OPENAI_API_KEY or OpenAI_API_KEY)

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

// A tiny nudge that keeps responses in first person without rewriting responses after the fact.
const FIRST_PERSON_HINT = `Speak as Tony in first person ("I", "my"), never about Tony in third person.`;

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
        const history = Array.isArray(body?.history) ? body.history : [];

        // NEW: optional persona text from the client (e.g., widget fetches system.md)
        const systemFromClient = (body?.system || "").toString().trim();

        // Optional client hints; keep your safe defaults
        const clientModel = (body?.model || "").toString().trim();
        const clientTemp =
          typeof body?.temperature === "number" ? body.temperature : undefined;

        if (!userMsg) {
          return new Response(
            JSON.stringify({ error: "Missing 'message' in request body." }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        // Decide provider: Groq if available, else OpenAI (kept exactly like your original order)
        const groqKey = env.GROQ_API_KEY;
        const openaiKey = env.OPENAI_API_KEY || env.OpenAI_API_KEY; // tolerate casing
        const hasOpenAI = !!openaiKey;
        const hasGroq = !!groqKey;

        if (!hasOpenAI && !hasGroq) {
          return new Response(
            JSON.stringify({ error: "No model provider configured (set OPENAI_API_KEY or GROQ_API_KEY)." }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        // Normalize history (optional, unchanged)
        const past = history
          .filter(m => m && m.role && m.content)
          .map(m => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-12); // keep it light

        // Build merged system prompt:
        // 1) your existing SYSTEM_PROMPT
        // 2) optional client persona (system.md)
        // 3) a tiny first-person nudge
        const mergedSystem = [SYSTEM_PROMPT, systemFromClient, FIRST_PERSON_HINT]
          .filter(Boolean)
          .join("\n\n");

        const messages = [
          { role: "system", content: mergedSystem },
          ...past,
          { role: "user", content: userMsg }
        ];

        // Build request for the chosen provider
        let apiUrl, headers, payload;

        if (hasOpenAI) {
          // Keep your original order: prefer OpenAI if key present
          apiUrl = "https://api.openai.com/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          };
          payload = {
            model: clientModel || "gpt-4o-mini",
            messages,
            temperature: typeof clientTemp === "number" ? clientTemp : 0.3,
            max_tokens: 200,
          };
        } else {
          apiUrl = "https://api.groq.com/openai/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          };
          payload = {
            model: clientModel || "llama-3.1-8b-instant",
            messages,
            temperature: typeof clientTemp === "number" ? clientTemp : 0.3,
            max_tokens: 200,
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
