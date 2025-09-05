// chat-widget/worker.js
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...JSON_HEADERS, ...CORS_HEADERS },
      });
    }

    // Chat endpoint
    if (url.pathname === '/chat') {
      if (req.method !== 'POST') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: CORS_HEADERS,
        });
      }

      const upstream = env.UPSTREAM_URL; // optional secret
      try {
        if (upstream) {
          // Proxy mode (optional)
          const proxied = await fetch(upstream, {
            method: 'POST',
            headers: {
              'Content-Type': 'text/plain',
              ...(env.UPSTREAM_AUTH ? { Authorization: env.UPSTREAM_AUTH } : {}),
            },
            body: await req.text(),
          });

          return new Response(await proxied.text(), {
            status: proxied.status,
            headers: {
              ...CORS_HEADERS,
              'Content-Type': proxied.headers.get('content-type') || 'application/json',
            },
          });
        } else {
          // Echo mode (works without any external API)
          const userText = (await req.text()).trim();
          const reply = userText
            ? `You said: ${userText}`
            : 'Hi! Chat service is live (no upstream set).';
          return new Response(JSON.stringify({ reply }), {
            status: 200,
            headers: { ...JSON_HEADERS, ...CORS_HEADERS },
          });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Upstream error', detail: String(err) }), {
          status: 502,
          headers: { ...JSON_HEADERS, ...CORS_HEADERS },
        });
      }
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};
const JSON_HEADERS = { 'Content-Type': 'application/json' };
