
// worker.js — Copilot proxy (Groq first, OpenAI fallback)
// Cleans model output to plain text with normalized bullets.

// --- Persona (updated to request plain text, no headings/bold) ---
const SYSTEM_PROMPT = `
You are Tony, speaking in first person. Write in plain text (no Markdown headings or emphasis).
Use concise sentences. When listing items:
- Use top-level bullets as "- ".
- Use sub-bullets as "  - ".
Avoid HTML/code fences. If you need sections, separate them with blank lines (no "##" headers).
If unsure, say so and ask one focused follow-up.
`.trim();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*", // tighten to your domain later
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}

// --- Server-side Markdown scrubber ---
function scrubMarkdown(t = "") {
  if (!t) return "";

  // Normalize newlines
  t = t.replace(/\r\n/g, "\n");

  // Strip bold/italics markers but keep text
  t = t.replace(/\*\*(.*?)\*\*/g, "$1"); // **bold**
  t = t.replace(/\*(.*?)\*/g, "$1");     // *italic* (best-effort)
  t = t.replace(/_(.*?)_/g, "$1");       // _italic_

  // Convert list markers
  // Indented/secondary bullets often arrive as "+" → make them "  - "
  t = t.replace(/^\s*\+\s+/gm, "  - ");
  // Primary bullets as "*" → "- "
  t = t.replace(/^\s*\*\s+/gm, "- ");

  // Strip headings like "## Title" / "### Title" / "# Title"
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, "");

  // Remove blockquote markers ">"
  t = t.replace(/^\s*>\s?/gm, "");

  // Collapse 3+ blank lines → 2
  t = t.replace(/\n{3,}/g, "\n\n");

  // Trim trailing spaces per line
  t = t.split("\n").map(line => line.replace(/[ \t]+$/g, "")).join("\n");

  // Final trim
  return t.trim();
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
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        // Optional chat history
        const history = Array.isArray(body?.history) ? body.history : [];
        const past = history
          .filter(m => m && m.role && m.content)
          .map(m => ({ role: m.role, content: m.content.toString().trim() }))
          .slice(-12);

        // Prefer client-provided system; fallback to embedded persona
        const clientSystem = (body?.system || "").toString().trim();
        const systemPrompt = clientSystem || SYSTEM_PROMPT;

        // Model aliasing (handle deprecated Groq names)
        const MODEL_ALIASES = {
          "llama3-8b-8192": "llama-3.1-8b-instant",
          "llama3-70b-8192": "llama-3.1-70b-versatile",
        };
        let model = (body?.model || "llama-3.1-8b-instant").toString();
        if (MODEL_ALIASES[model]) model = MODEL_ALIASES[model];

        const temperature = Number.isFinite(+body?.temperature) ? +body.temperature : 0.25;

        const messages = [
          { role: "system", content: systemPrompt },
          ...past,
          { role: "user", content: userMsg },
        ];

        // Provider selection
        const hasOpenAI = !!env.OPENAI_API_KEY;
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
          payload = { model, messages, temperature, max_tokens: 900 };
        } else {
          apiUrl = "https://api.openai.com/v1/chat/completions";
          headers = {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          };
          payload = { model: "gpt-4o-mini", messages, temperature, max_tokens: 900 };
        }

        const resp = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const txt = await resp.text();
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
        const raw =
          data?.choices?.[0]?.message?.content?.trim() ||
          "Sorry—no response was generated.";

        const reply = scrubMarkdown(raw); // <-- clean before returning

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
