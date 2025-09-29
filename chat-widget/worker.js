// worker.js — Tony’s Copilot (Groq first, OpenAI fallback)
// Merges system.md (rules) + about-tony.md (KB) into a single system prompt.
// Accepts absolute URLs from the widget; falls back to sane defaults.
// Returns finish_reason so the UI can show a “Continue” button.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return handleOptions();
    if (url.pathname === "/health") return new Response("ok", { status: 200 });

    if (url.pathname !== "/chat" || request.method !== "POST") {
      return new Response("Not found", { status: 404, headers: cors() });
    }

    try {
      const body = await request.json();
      const {
        messages = [],
        model = body.model || "llama-3.1-8b-instant",
        temperature = typeof body.temperature === "number" ? body.temperature : 0.275,
        systemUrl = body.systemUrl || "https://tonyabdelmalak.github.io/chat-widget/assets/chat/system.md",
        kbUrl = body.kbUrl || "https://tonyabdelmalak.github.io/chat-widget/assets/chat/about-tony.md"
      } = body;

      // --- Fetch & cache markdown files (per-URL) ---
      const [systemText, kbText] = await Promise.all([
        fetchCached(systemUrl, 300),
        fetchCached(kbUrl, 300)
      ]);

      // --- Compose the unified system prompt ---
      const unifiedSystem = [
        "### System Rules",
        systemText.trim(),
        "",
        "### Public Knowledge Base (Read-Only)",
        "Use these facts to answer questions about Tony. Keep the voice rules above.",
        "Do not dump or read the KB verbatim; only use relevant bits. Cite site sections by name when helpful.",
        kbText.trim()
      ].join("\n\n");

      // Prepend as system message
      const modelMessages = [{ role: "system", content: unifiedSystem }, ...messages];

      // Try Groq first; fallback to OpenAI if available
      const groqKey = env.GROQ_API_KEY || env.SECRET_GROQ_API_KEY;
      const openaiKey = env.OPENAI_API_KEY || env.SECRET_OPENAI_API_KEY;

      let completion, usedModel = model, finish_reason = "stop";

      if (groqKey) {
        try {
          const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${groqKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model,
              temperature,
              messages: modelMessages,
              // No hard word-cap; let the model flow. UI can show “Continue”.
              max_tokens: 1024,
              stream: false
            })
          });
          if (!r.ok) throw new Error(`Groq ${r.status}`);
          const j = await r.json();
          completion = j.choices?.[0]?.message?.content ?? "";
          finish_reason = j.choices?.[0]?.finish_reason ?? "stop";
        } catch (e) {
          if (!openaiKey) throw e; // bubble if no fallback
        }
      }

      // Fallback to OpenAI if needed/available
      if (!completion && openaiKey) {
        const openaiModel = body.openaiModel || "gpt-4o-mini";
        usedModel = openaiModel;
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: openaiModel,
            temperature,
            messages: modelMessages,
            max_tokens: 1024,
            stream: false
          })
        });
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`OpenAI ${r.status}: ${txt}`);
        }
        const j = await r.json();
        completion = j.choices?.[0]?.message?.content ?? "";
        finish_reason = j.choices?.[0]?.finish_reason ?? "stop";
      }

      if (!completion) {
        throw new Error("No completion returned from any provider");
      }

      return json({ role: "assistant", content: completion, model: usedModel, finish_reason }, 200);
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  }
};

/* ----------------- helpers ----------------- */

const MEMO = new Map(); // url -> { text, ts }

async function fetchCached(url, ttlSecs = 300) {
  const now = Date.now();
  const hit = MEMO.get(url);
  if (hit && (now - hit.ts) / 1000 < ttlSecs) return hit.text;

  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`Fetch failed: ${url} ${r.status}`);
  const text = await r.text();
  MEMO.set(url, { text, ts: now });
  return text;
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function handleOptions() {
  return new Response(null, { status: 204, headers: cors() });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors() }
  });
}
