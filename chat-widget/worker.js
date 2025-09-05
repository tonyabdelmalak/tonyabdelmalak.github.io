// chat-widget/worker.js
export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle CORS preflight
    if (url.pathname === "/chat" && request.method === "OPTIONS") {
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
    if (url.pathname === "/chat" && request.method === "POST") {
      try {
        const { system, message } = await request.json();

        if (!message) {
          return new Response(
            JSON.stringify({ error: "Missing message" }),
            { status: 400 }
          );
        }

        // --- Call the model ---
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, // store in secret
          },
          body: JSON.stringify({
            model: "gpt-4o-mini", // lightweight, fast
            messages: [
              { role: "system", content: system || "You are a helpful assistant." },
              { role: "user", content: message },
            ],
            max_tokens: 200,
          }),
        });

        const data = await resp.json();
        const reply = data.choices?.[0]?.message?.content?.trim() || "…";

        return new Response(JSON.stringify({ reply }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: 500 }
        );
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
