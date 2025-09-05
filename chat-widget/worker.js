export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }
    // Health endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: corsHeaders(req, { 'Content-Type': 'application/json' })
      });
    }
    // Chat endpoint (proxy or stub)
    if (url.pathname === '/chat') {
      if (req.method === 'POST') {
        // You can implement your chat logic here, e.g. forward to an upstream API
        // For now, just echo back the request body as a stub
        const body = await req.text();
        return new Response(JSON.stringify({ echo: body }), {
          status: 200,
          headers: corsHeaders(req, { 'Content-Type': 'application/json' })
        });
      }
      return new Response('Method Not Allowed', {
        status: 405,
        headers: corsHeaders(req)
      });
    }
    return new Response('Not Found', { status: 404, headers: corsHeaders(req) });
  }
};

function corsHeaders(req, extra = {}) {
  const origin = req.headers.get('Origin') || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type,Authorization',
    'access-control-allow-credentials': 'true',
    ...extra
  };
}

// Durable Object stub to satisfy existing binding
export class Chat {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  // Handle requests to the Durable Object
  async fetch(request) {
    // For now, respond with a simple OK. You can implement chat logic here later.
    return new Response('OK', { status: 200, headers: { 'content-type': 'text/plain' } });
  }
}

