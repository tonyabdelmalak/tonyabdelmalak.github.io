// Cloudflare Worker for Copilot proxy with strict CORS
// Routes:
//   GET  /health  -> { ok: true }
//   POST /chat    -> handle chat payload (stubbed reply here; swap in your model call)

// ---- CORS helpers ----
const ALLOWED_ORIGINS = [
  'https://tonyabdelmalak.github.io',
  'http://localhost:4000', // optional: local preview
];

function corsHeaders(req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://tonyabdelmalak.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function withCors(req, body, init = {}) {
  const headers = new Headers(init.headers || {});
  const add = corsHeaders(req);
  Object.entries(add).forEach(([k, v]) => headers.set(k, v));
  return new Response(body, { ...init, headers });
}

// ---- Chat handler (swap stub with your model call) ----
async function handleChat(req /*, env */) {
  // Expecting a JSON body like: { messages: [{role, content}, ...] }
  let userText = 'Hello';
  try {
    const data = await req.json();
    const last = Array.isArray(data?.messages) ? data.messages[data.messages.length - 1] : null;
    userText = (last?.content || userText).toString().slice(0, 2000);
  } catch (_) { /* ignore; use default */ }

  // TODO: replace this stub with your real model call
  // e.g. call OpenAI or your router, then return its text
  const reply =
    "Hi — connection is working. Ask about Tony’s dashboards, résumé, or career pivot. (If you’re seeing this, the proxy is up!)";

  // Return a simple, predictable shape your widget can read.
  // If your widget expects a different shape, adjust here.
  return JSON.stringify({
    role: 'assistant',
    content: reply,
  });
}

// ---- Worker entry ----
export default {
  async fetch(req, env, ctx) {
    // Preflight
    if (req.method === 'OPTIONS') {
      return withCors(req, null, { status: 204 });
    }

    const url = new URL(req.url);

    // Health check
    if (req.method === 'GET' && url.pathname === '/health') {
      return withCors(
        req,
        JSON.stringify({ ok: true, ts: Date.now() }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Chat endpoint
    if (req.method === 'POST' && url.pathname === '/chat') {
      try {
        const body = await handleChat(req, env);
        return withCors(req, body, { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        return withCors(
          req,
          JSON.stringify({ error: 'chat_failed', details: String(err?.message || err) }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fallback
    return withCors(
      req,
      JSON.stringify({ error: 'not_found', path: url.pathname }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  },
};
