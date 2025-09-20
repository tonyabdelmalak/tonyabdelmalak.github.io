// worker.js — Copilot proxy (Groq first, fallback to OpenAI)
// Keeps your permissive CORS exactly as-is to avoid reintroducing "Failed to fetch".
// Adds persona support from the client (system.md via widget.js) with a 1st-person default.
// Fixes OPENAI key casing bug and makes provider selection Groq→OpenAI.

const FIRST_PERSON_SYSTEM = `
You are Tony. Speak in the first person as Tony (use "I", not "he/him").
Be warm, concise, and helpful. If unsure, say so briefly and ask one smart follow-up.
Priorities:
1) Help visitors understand my work, dashboards, and background.
2) If asked for private/sensitive info, decline and point to public resources.
3) Keep replies brief (≤60 words) unless returning code. Use short sentences/bullets.
4) No medical/legal/financial advice—suggest a professional.
`.trim();

// --- CORS (unchanged from your working version) ---
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
        const systemFromClient = (body?.system || "").toString().trim(); // <- persona text from widget (system.md)

        if (!userMsg) {
          return new Response(
            JSON.stringify({ error: "Missing 'message' in request body." }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        // Provider selection: Groq first, fallback to OpenAI
        const hasGroq = !!env.GROQ_API_KEY;
        const hasOpenAI = !!env.OPENAI_API_KEY; // <-- fixed casing

        if (!hasGroq && !hasOpenAI) {
          return new Response(
            JSON.stringify({ error: "No model provider configured (set GROQ_API_KEY or OPENAI_API_KEY)." }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        // Normalize history (keep it light)
        const past = history
          .filter(m => m && m.role && m.content)
          .map(m => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-12);

        // Persona/system: prefer client-provided system.md; otherwise use 1st-person default
        const systemPrompt = systemFromClient || FIRST_PERSON_SYSTEM;

        const messages = [
          { role: "system", content: systemPrompt },
          ...past,
          { role: "user", content: userMsg }
        ];

        // Allow client/body to hint model/temperature, but keep safe defaults
        const clientModel = (body?.model || "").toString().trim();
        const clientTemp =
          typeof body?.temperature === "number" ? body.temperature : undefined;
        const temperature = typeof clientTemp === "number" ? clientTemp : 0.3;
        const max_tokens =
          typeof body?.max_tokens === "number" ? body.max_tokens : 200;

        // Build request to the chosen provider
        let apiUrl, headers, payload;

        if (hasGroq) {
          apiUrl = "https://api.groq.com/openai/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          };
          payload = {
            model: clientModel || "llama-3.1-8b-instant",
            messages,
            temperature,
            max_tokens
          };
        } else {
          apiUrl = "https://api.openai.com/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`, // <-- fixed casing
            "Content-Type": "application/json",
          };
          payload = {
            model: clientModel || "gpt-4o-mini",
            messages,
            temperature,
            max_tokens
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

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};
