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
        headers: corsHeaders(req, { 'Content-Type': 'application/json' }),
      });
    }

    // Chat endpoint
    if (url.pathname === '/chat') {
      if (req.method.toUpperCase() === 'POST') {
        const bodyText = await req.text();
        // Here you can implement chat logic (e.g., call an upstream API). For now, echo back the request body.
        return new Response(JSON.stringify({ echo: bodyText }), {
          status: 200,
          headers: corsHeaders(req, { 'Content-Type': 'application/json' }),
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
  // Always allow any origin and specify allowed methods/headers
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization',
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
    return new Response('OK', { status: 200, headers: { 'content-type': 'text/plain' } });
  }
}
