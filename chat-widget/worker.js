export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders(req, { 'content-type': 'application/json' }) });
    }
    if (url.pathname === '/chat') {
      const body = await req.text();
      return new Response(body || JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders(req, { 'content-type': 'application/json' }) });
    }
    return new Response('Not found', { status: 404, headers: corsHeaders(req) });
  }
};
function corsHeaders(req, extra = {}) {
  const origin = req.headers.get('origin') || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    ...extra
  };
}// ---- Durable Object stub (required by CF if binding exists) ----

export class Chat {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) { return new Response('OK'); }
}
