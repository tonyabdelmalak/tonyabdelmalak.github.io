export default {
  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Preflight (CORS)
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "content-type, authorization",
        },
      });
    }

    // Chat endpoint
    if (url.pathname === "/chat" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const userMsg = body?.message || "…";

      // Temporary stub response (replace later with AI call)
      return new Response(
        JSON.stringify({
          reply: `You said: ${userMsg}. Copilot is connected and listening!`,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
