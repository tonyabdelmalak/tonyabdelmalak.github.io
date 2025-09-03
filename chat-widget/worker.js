// Cloudflare Worker proxy for GROQ Chat Completions (non-streaming)
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
    }

    if (url.pathname === '/chat' && request.method === 'POST') {
      if (!env.API_KEY) {
        return json({ error: 'Missing API_KEY' }, 500, request);
      }
      try {
        const body = await request.json();
        const model = body.model || 'llama-3.1-8b-instant';
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const temperature = typeof body.temperature === 'number' ? body.temperature : 0.3;
        const max_tokens = typeof body.max_tokens === 'number' ? body.max_tokens : 800;

        const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ model, messages, temperature, max_tokens, stream: false })
        });

        if (!upstream.ok) {
          const errText = await upstream.text();
          return json({ error: 'Upstream error', status: upstream.status, body: errText }, upstream.status, request);
        }
        const data = await upstream.json();
        const content = data?.choices?.[0]?.message?.content ?? '';
        return json({ content, raw: data }, 200, request);
      } catch (err) {
        return json({ error: String(err) }, 500, request);
      }
    }

    return new Response('chat-widget-proxy ok', { status: 200, headers: corsHeaders(request) });
  }
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

function json(obj, status=200, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request)
    }
  });
}
