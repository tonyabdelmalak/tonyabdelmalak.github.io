// worker.js — Copilot proxy (Groq first, OpenAI fallback)
// Cleans model output to plain text with normalized bullets.

// --- Persona (updated to request plain text, no headings/bold) ---
const SYSTEM_PROMPT = [
    "You are Tony speaking in FIRST PERSON. Always use “I” and “my”.",
    "Introduce yourself ONLY on the FIRST turn of a NEW session. Never repeat the welcome unless explicitly asked \"who are you\" or \"what is this\".",
    "If the user repeats a broad ask (e.g., “dashboards”), do NOT reintroduce yourself. Instead, go deeper: explain steps, choices, tradeoffs, and outcomes.",
    "Tone: professional, direct, approachable. Use contractions. Short, active sentences.",
    "Emphasize value and results: e.g., “I automated X to save Y hours per week.”",
    "When asked about dashboards, default to a concrete example with steps: data sources → prep → modeling → visuals → interactivity → impact.",
    "If context is unclear, ask one focused question, then continue with a best-practice answer."
  ]
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
  t = t.replace(/\r\n/g, "\n");

  // 1) Remove "What I say:" blocks
  // a) If it's followed by a quoted sentence (smart or straight quotes), remove that too
  t = t.replace(/\bWhat I say:\s*[“"][\s\S]*?[”"](?:\n|$)/g, "");
  // b) Fallback: remove the rest of the line after "What I say:"
  t = t.replace(/\bWhat I say:.*(?:\n|$)/g, "");

  // 2) Strip emphasis markers, keep words
  t = t.replace(/\*\*(.*?)\*\*/g, "$1"); // **bold**
  t = t.replace(/\*(.*?)\*/g, "$1");     // *italic*
  t = t.replace(/_(.*?)_/g, "$1");       // _italic_

  // 3) Lists: make primary bullets "- ", sub-bullets "  - "
  t = t.replace(/^\s*\+\s+/gm, "  - ");  // "+ " → sub-bullet
  t = t.replace(/^\s*\*\s+/gm, "- ");    // "* " → bullet

  // 4) Remove Markdown headings/quotes markers
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, ""); // "#", "##", "###"...
  t = t.replace(/^\s*>\s?/gm, "");          // "> "

  // 5) Collapse too many blank lines and trim trailing spaces
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.split("\n").map(line => line.replace(/[ \t]+$/g, "")).join("\n");

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
};// worker.js — Copilot proxy (Groq first, OpenAI fallback)
// Cleans model output to plain text with normalized bullets.

// --- Persona (updated to request plain text, no headings/bold) ---
const SYSTEM_PROMPT = [
    "You are Tony speaking in FIRST PERSON. Always use “I” and “my”.",
    "Introduce yourself ONLY on the FIRST turn of a NEW session. Never repeat the welcome unless explicitly asked \"who are you\" or \"what is this\".",
    "If the user repeats a broad ask (e.g., “dashboards”), do NOT reintroduce yourself. Instead, go deeper: explain steps, choices, tradeoffs, and outcomes.",
    "Tone: professional, direct, approachable. Use contractions. Short, active sentences.",
    "Emphasize value and results: e.g., “I automated X to save Y hours per week.”",
    "When asked about dashboards, default to a concrete example with steps: data sources → prep → modeling → visuals → interactivity → impact.",
    "If context is unclear, ask one focused question, then continue with a best-practice answer."
  ]
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
  t = t.replace(/\r\n/g, "\n");

  // 1) Remove "What I say:" blocks
  // a) If it's followed by a quoted sentence (smart or straight quotes), remove that too
  t = t.replace(/\bWhat I say:\s*[“"][\s\S]*?[”"](?:\n|$)/g, "");
  // b) Fallback: remove the rest of the line after "What I say:"
  t = t.replace(/\bWhat I say:.*(?:\n|$)/g, "");

  // 2) Strip emphasis markers, keep words
  t = t.replace(/\*\*(.*?)\*\*/g, "$1"); // **bold**
  t = t.replace(/\*(.*?)\*/g, "$1");     // *italic*
  t = t.replace(/_(.*?)_/g, "$1");       // _italic_

  // 3) Lists: make primary bullets "- ", sub-bullets "  - "
  t = t.replace(/^\s*\+\s+/gm, "  - ");  // "+ " → sub-bullet
  t = t.replace(/^\s*\*\s+/gm, "- ");    // "* " → bullet

  // 4) Remove Markdown headings/quotes markers
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, ""); // "#", "##", "###"...
  t = t.replace(/^\s*>\s?/gm, "");          // "> "

  // 5) Collapse too many blank lines and trim trailing spaces
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.split("\n").map(line => line.replace(/[ \t]+$/g, "")).join("\n");

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
