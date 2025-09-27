// worker.js — Server-pinned model (qwen/qwen-2.5-7b-instruct) + grounded context

const MODEL = "qwen/qwen-2.5-7b-instruct"; // <- change here later if you like

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Only POST /chat
    if (url.pathname !== "/chat" || request.method !== "POST") {
      return new Response("Not found", { status: 404, headers: corsHeaders(request) });
    }

    // Allow your site origins
    const origin = request.headers.get("Origin") || "";
    if (origin && !["https://tonyabdelmalak.com", "https://www.tonyabdelmalak.com"].includes(origin)) {
      return json({ error: "Origin not allowed" }, 403, request);
    }

    try {
      const body = await request.json().catch(() => ({}));
      const { message, system, temperature, history, context } = body || {};

      if (!env.OPENROUTER_API_KEY) {
        return json({ error: "Missing OPENROUTER_API_KEY" }, 500, request);
      }

      const persona = context?.persona || {};
      const sources = Array.isArray(context?.sources) ? context.sources : [];

      // Build prompts
      const finalSystem = buildSystemPrompt(system, persona);
      const assistantContext = buildAssistantContext(buildContextText(sources));

      const messages = [
        { role: "system", content: finalSystem },
        ...(Array.isArray(history) ? sanitizeHistory(history, 12) : []),
        // put retrieved context inside the user turn so it doesn't echo
        { role: "user", content: `${assistantContext}\n\nUser: ${String(message || "")}` }
      ];

      // Call OpenRouter with pinned model
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://tonyabdelmalak.com",
          "X-Title": "Tony Chat Widget"
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: typeof temperature === "number" ? temperature : 0.2,
          messages
        })
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return json({ error: `OpenRouter ${r.status}: ${txt}` }, 502, request);
      }

      const data = await r.json().catch(() => ({}));
      const raw =
        data?.choices?.[0]?.message?.content ||
        data?.text || data?.reply || data?.message || data?.content || "";

      // light de-dup of repeated lines
      const clean = String(raw || "")
        .split("\n")
        .filter((line, i, arr) => !line.trim() || arr.indexOf(line) === i)
        .join("\n");

      return json({ text: clean }, 200, request);
    } catch (err) {
      return json({ error: String(err?.message || err) }, 500, request);
    }
  }
};

/* ========= helpers ========= */

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ["https://tonyabdelmalak.com", "https://www.tonyabdelmalak.com"];
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(obj, status, request) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(request) }
  });
}

function sanitizeHistory(history, max = 12) {
  const allowed = new Set(["user", "assistant"]);
  return (history || [])
    .filter(t => allowed.has(t.role) && typeof t.content === "string")
    .slice(-Math.max(1, max))
    .map(t => ({ role: t.role, content: t.content.slice(0, 4000) }));
}

function buildSystemPrompt(systemFromClient, persona) {
  const base = (systemFromClient || "").toString().slice(0, 12000);
  const p = persona || {};
  const lines = [];
  if (p.name)    lines.push(`Name: ${p.name}`);
  if (p.title)   lines.push(`Title: ${p.title}`);
  if (p.tagline) lines.push(`Tagline: ${p.tagline}`);
  if (Array.isArray(p.skills) && p.skills.length) lines.push(`Skills: ${p.skills.join(", ")}`);
  return [
    base,
    "",
    "## Rules",
    "- Ground answers in the retrieved context (resume, site pages, persona).",
    "- Be creative in phrasing, but do not invent employers, project names, or metrics not present in context.",
    "- If context is insufficient, say you're not sure and suggest checking the relevant link.",
    "- Aim for clear, concise answers unless the user asks for deep detail.",
    lines.length ? "\n## Persona\n" + lines.join("\n") : ""
  ].filter(Boolean).join("\n");
}

function buildAssistantContext(contextText) {
  if (!contextText) return "No external context provided for this turn.";
  return [
    "### Retrieved Context",
    "Use relevant parts of these snippets (resume + site pages) when answering:",
    contextText
  ].join("\n\n");
}

function buildContextText(sources, opts = {}) {
  const maxSources = opts.maxSources || 6;
  const maxChunksPer = opts.maxChunksPer || 6;
  const maxChars = opts.maxChars || 24000;

  let out = "";
  for (const src of (Array.isArray(sources) ? sources : []).slice(0, maxSources)) {
    if (!src || !src.title || !Array.isArray(src.chunks)) continue;
    const joined = src.chunks.slice(0, maxChunksPer).join("\n\n").trim();
    if (!joined) continue;
    const block = `\n---\n# ${src.title}\n${joined}\n`;
    if (out.length + block.length > maxChars) break;
    out += block;
  }
  return out.trim();
}
