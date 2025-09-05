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
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    // Chat endpoint (proxy or stub)
    if (url.pathname === '/chat') {
      if (req.method === 'POST') {
        // Echo back the request body as a stub
        const body = await req.text();
        return new Response(JSON.stringify({ echo: body }), {
          status: 200,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
      return new Response('Method Not Allowed', {
        status: 405,
        headers: corsHeaders(req),
      });
    }
    return new Response('Not Found', { status: 404, headers: corsHeaders(req) });
  },
};

function corsHeaders(req, extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Credentials': 'true',
    ...extra,
  };
}

// Durable Object stub to satisfy existing binding
export class Chat {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    // Respond with a simple OK
    return new Response('OK', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }
}
