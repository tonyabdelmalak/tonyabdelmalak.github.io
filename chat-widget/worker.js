// Cloudflare Worker: health, CORS preflight, and /chat echo (or proxy if UPSTREAM_URL set)
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // 1) CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // 2) Health
    if (pathname === '/health') {
      return json({ ok: true });
    }

    // 3) Chat
    if (pathname === '/chat' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (_) {}

      const msg = (body.message || '').toString();

      // Optional real proxying
      if (env.UPSTREAM_URL) {
        const upstreamRes = await fetch(env.UPSTREAM_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(env.UPSTREAM_AUTH ? { 'Authorization': env.UPSTREAM_AUTH } : {})
          },
          body: JSON.stringify({
            message: msg,
            history: body.history || [],
            system: body.system || ''
          })
        });
        const data = await upstreamRes.json().catch(() => ({}));
        return json(data);
      }

      // Default echo mode
      return json({ reply: `You said: ${msg}` });
    }

    // 4) Not found
    return new Response('Not Found', { status: 404, headers: corsHeaders() });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization'
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
