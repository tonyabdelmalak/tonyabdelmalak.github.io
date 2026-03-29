export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(s=>s.trim());
    const origin = request.headers.get("Origin");
    const allowOrigin = allowed.includes("*") ? "*" : (allowed.includes(origin) ? origin : "");

    if (request.method === "OPTIONS") return new Response(null, { headers: cors(allowOrigin) });

    if (url.pathname === "/chat" && request.method === "POST") {
      if (!env.GROQ_API_KEY) return j({ error: "GROQ_API_KEY not set" }, 500, allowOrigin);
      const { messages = [], model = "llama3-8b-8192", temperature = 0.2 } = await request.json().catch(()=>({}));

      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature, messages })
      });
      if (!resp.ok) return j({ error: `Groq ${resp.status}: ${await resp.text()}` }, resp.status, allowOrigin);

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      return j({ content }, 200, allowOrigin);
    }
    return new Response("Not Found", { status: 404, headers: cors(allowOrigin) });
  }
};
function cors(o){return{"Access-Control-Allow-Origin":o||"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Max-Age":"86400"}}
function j(obj, status, o){return new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json; charset=utf-8",...cors(o)}})}
