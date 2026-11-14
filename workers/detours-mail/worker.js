// Detours newsletter service (Cloudflare Worker).
// Routes:
//   POST /subscribe   email, first_name, website (honeypot) -> sends a confirmation email (double opt-in)
//   GET  /confirm?t=  adds the contact (General segment + Detours topic), sends the welcome email
//   GET  /unsubscribe?t= and POST (one-click) -> opts the contact out of Detours
//   GET  /health
// Cron (daily): when a new Detours post is live and the newsletter is enabled, sends it once to subscribers.
// Secret: RESEND_API_KEY (set in the Cloudflare dashboard). Nothing secret lives in this file.

const SITE = "https://tonyabdelmalak.com";
const FROM = "Tony Abdelmalak <detours@tonyabdelmalak.com>";
const REPLY_TO = "tony.abdelmalak@yahoo.com";
const SEGMENT_ID = "786f2488-8996-4781-8737-3dc8fe23a0ec"; // "General"; delivery is scoped by the Detours topic
const TOPIC_ID = "5fa72284-4c44-4853-84d0-6c060c1ecc3b";   // "Detours" (opt-in)
const API = "https://api.resend.com";
const ORIGINS = ["https://tonyabdelmalak.com", "https://www.tonyabdelmalak.com"];
const DAY = 86400;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (req.method === "OPTIONS") return cors(req, new Response(null, { status: 204 }));
      if (url.pathname === "/health") return json(req, { ok: true, service: "detours-mail" });
      if (url.pathname === "/subscribe" && req.method === "POST") return await subscribe(req, env);
      if (url.pathname === "/confirm") return await confirm(url, env);
      if (url.pathname === "/unsubscribe") return await unsubscribe(req, url, env);
      return new Response("Not found", { status: 404 });
    } catch (e) {
      console.log("error", e && e.stack || e);
      return json(req, { ok: false, error: "Something went wrong. Please try again." }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendLatest(env));
  },
};

// ---------- helpers ----------
function cors(req, res) {
  const o = req.headers.get("Origin");
  if (o && ORIGINS.includes(o)) {
    res.headers.set("Access-Control-Allow-Origin", o);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
  return res;
}
function json(req, obj, status = 200) {
  return cors(req, new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }));
}
function redirect(path) {
  return Response.redirect(SITE + path, 303);
}
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uText = (s) => b64u(enc.encode(s));
const fromB64u = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
async function hmacKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("detours-v1:" + env.RESEND_API_KEY));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function sign(env, payload) {
  const body = b64uText(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(body));
  return body + "." + b64u(sig);
}
async function verify(env, token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = b64u(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(body)));
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return null;
  const p = JSON.parse(fromB64u(body));
  if (p.x && Date.now() / 1000 > p.x) return null;
  return p;
}
async function resend(env, method, path, body, extraHeaders = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json", ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (_) {}
  return { ok: r.ok, status: r.status, data };
}
async function config() {
  const r = await fetch(SITE + "/detours/newsletter.json", { cf: { cacheTtl: 60 } });
  if (!r.ok) return { enabled: false };
  return r.json();
}
const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cleanName = (s) => String(s || "").replace(/[^\p{L}\p{M}' .-]/gu, "").trim().slice(0, 40);
const validEmail = (s) => /^[^\s@<>()[\],;:"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/.test(s);
async function hash(s) {
  return b64u(await crypto.subtle.digest("SHA-256", enc.encode(s))).slice(0, 22);
}

// ---------- email shell (table layout, inline styles) ----------
function shell({ preheader, bodyHtml, address, unsubUrl }) {
  const foot = `${address ? esc(address) + "<br>" : ""}You're getting this because you subscribed to Detours at tonyabdelmalak.com.${unsubUrl ? ` <a href="${unsubUrl}" style="color:#475569;text-decoration:underline">Unsubscribe</a>` : ""}`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>Detours</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f8">
<span style="display:none;max-height:0;overflow:hidden;color:#f4f6f8">${esc(preheader)}</span>
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f6f8" style="background-color:#f4f6f8"><tr><td align="center" style="padding-top:24px;padding-bottom:24px;padding-left:12px;padding-right:12px">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td bgcolor="#001e42" style="background-color:#001e42;padding-top:22px;padding-bottom:22px;padding-left:28px;padding-right:28px;border-top-left-radius:14px;border-top-right-radius:14px">
<a href="${SITE}/detours/" style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:28px;color:#ffffff;text-decoration:none">Detours</a>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#99f6e4">Notes from a career that didn't go in a straight line</div></td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding-top:28px;padding-bottom:28px;padding-left:28px;padding-right:28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#1e293b">${bodyHtml}</td></tr>
<tr><td style="padding-top:18px;padding-bottom:8px;padding-left:28px;padding-right:28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b">${foot}</td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href, label) =>
  `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;margin-bottom:8px"><tr><td bgcolor="#0f766e" style="background-color:#0f766e;border-radius:999px"><a href="${href}" style="display:inline-block;padding-top:12px;padding-bottom:12px;padding-left:22px;padding-right:22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;color:#ffffff;text-decoration:none;font-weight:bold">${label}</a></td></tr></table>`;

// ---------- routes ----------
async function subscribe(req, env) {
  const cfg = await config();
  if (!cfg.enabled) return json(req, { ok: false, error: "Sign-ups open soon." }, 503);
  const ct = req.headers.get("Content-Type") || "";
  const form = ct.includes("application/json") ? await req.json() : Object.fromEntries(await req.formData());
  const wantsHtml = !ct.includes("application/json");
  if (form.website) return wantsHtml ? redirect("/detours/thanks/") : json(req, { ok: true }); // honeypot
  const email = String(form.email || "").trim().toLowerCase();
  if (!validEmail(email)) return json(req, { ok: false, error: "Please enter a valid email address." }, 400);
  const name = cleanName(form.first_name);
  const token = await sign(env, { e: email, n: name, s: String(form.source || "site").slice(0, 40), x: Math.floor(Date.now() / 1000) + 7 * DAY });
  const link = new URL(req.url).origin + "/confirm?t=" + encodeURIComponent(token);
  const hi = name ? `Hi ${esc(name)},` : "Hi,";
  const html = shell({
    preheader: "One click and you're in.",
    bodyHtml: `<p style="margin-top:0">${hi}</p><p>Thanks for signing up for Detours. One click and you're in:</p>${button(link, "Confirm my subscription")}<p>If you didn't ask for this, you can ignore this email and you won't hear from me.</p><p style="margin-bottom:0">Tony</p>`,
    address: cfg.postal_address,
  });
  const text = `${name ? "Hi " + name : "Hi"},\n\nThanks for signing up for Detours. Confirm your subscription here:\n${link}\n\nIf you didn't ask for this, ignore this email and you won't hear from me.\n\nTony`;
  const day = new Date().toISOString().slice(0, 10);
  const r = await resend(env, "POST", "/emails", { from: FROM, to: [email], reply_to: REPLY_TO, subject: "Confirm your Detours subscription", html, text },
    { "Idempotency-Key": `detours-confirm-${await hash(email)}-${day}` });
  if (!r.ok && r.status !== 409) {
    console.log("confirm send failed", r.status, JSON.stringify(r.data));
    return json(req, { ok: false, error: "We couldn't send the confirmation email. Please try again." }, 502);
  }
  return wantsHtml ? redirect("/detours/thanks/") : json(req, { ok: true });
}

async function upsertContact(env, email, name) {
  const created = await resend(env, "POST", "/contacts", {
    email, first_name: name || undefined, unsubscribed: false,
    segments: [{ id: SEGMENT_ID }], topics: [{ id: TOPIC_ID, subscription: "opt_in" }],
  });
  if (created.ok) return true;
  // Already a contact (for example a CareerPaver or Lumira subscriber): update in place.
  const id = encodeURIComponent(email);
  await resend(env, "PATCH", `/contacts/${id}`, { unsubscribed: false, ...(name ? { first_name: name } : {}) });
  await resend(env, "POST", `/contacts/${id}/segments/${SEGMENT_ID}`);
  const t = await resend(env, "PATCH", `/contacts/${id}/topics`, [{ id: TOPIC_ID, subscription: "opt_in" }]);
  if (!t.ok) console.log("topic update failed", t.status, JSON.stringify(t.data));
  return t.ok;
}

async function confirm(url, env) {
  const p = await verify(env, url.searchParams.get("t"));
  if (!p) return redirect("/detours/?subscribe=expired#subscribe");
  const cfg = await config();
  await upsertContact(env, p.e, p.n);
  const unsub = new URL(url.origin + "/unsubscribe");
  unsub.searchParams.set("t", await sign(env, { e: p.e, u: 1 }));
  const hi = p.n ? `Hi ${esc(p.n)},` : "Hi,";
  const html = shell({
    preheader: "Here's the Detour Kit, and what to expect.",
    bodyHtml: `<p style="margin-top:0">${hi}</p>
<p>You're in, and I'm glad you're here.</p>
<p>Once a week you'll get one Detours post: a real moment from my path, one published number that shows a path like yours is more normal than it feels, and one thing you can use that week.</p>
<p>Your welcome gift is the Detour Kit: the two-sentence way I now answer the career-gap question, how to talk about contract roles without sounding defensive, and the rules I follow to use AI honestly.</p>
${button(SITE + "/detours/kit/", "Open the Detour Kit")}
<p>If you want more in between, I post on LinkedIn most weeks. <a href="https://www.linkedin.com/in/tony-abdelmalak" style="color:#0f766e">Follow me there</a>.</p>
<p style="margin-bottom:0">Tony</p>`,
    address: cfg.postal_address,
    unsubUrl: unsub.toString(),
  });
  const text = `${p.n ? "Hi " + p.n : "Hi"},\n\nYou're in, and I'm glad you're here.\n\nOnce a week you'll get one Detours post: a real moment from my path, one published number, and one thing you can use that week.\n\nYour welcome gift, the Detour Kit: ${SITE}/detours/kit/\n\nI also post on LinkedIn most weeks: https://www.linkedin.com/in/tony-abdelmalak\n\nTony\n\n${cfg.postal_address || ""}\nUnsubscribe: ${unsub}`;
  await resend(env, "POST", "/emails", {
    from: FROM, to: [p.e], reply_to: REPLY_TO, subject: "You're in. Here's the Detour Kit.", html, text,
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  }, { "Idempotency-Key": `detours-welcome-${await hash(p.e)}` });
  return redirect("/detours/welcome/");
}

async function unsubscribe(req, url, env) {
  const p = await verify(env, url.searchParams.get("t"));
  if (!p || !p.u) return redirect("/detours/");
  await resend(env, "PATCH", `/contacts/${encodeURIComponent(p.e)}/topics`, [{ id: TOPIC_ID, subscription: "opt_out" }]);
  if (req.method === "POST") return new Response("Unsubscribed", { status: 200 });
  return redirect("/detours/unsubscribed/");
}

// ---------- weekly send ----------
async function sendLatest(env) {
  const cfg = await config();
  if (!cfg.enabled || !cfg.postal_address || !cfg.weekly_send) { console.log("weekly send off"); return; }
  const r = await fetch(SITE + "/detours/email/latest.json", { cf: { cacheTtl: 0 } });
  if (!r.ok) return;
  const post = await r.json();
  const name = `Detours No. ${post.number}`;
  const list = await resend(env, "GET", "/broadcasts");
  const items = (list.data && list.data.data) || [];
  if (items.some((b) => b.name === name)) { console.log(name, "already sent"); return; }
  const html = shell({ preheader: post.dek, bodyHtml: post.html, address: cfg.postal_address, unsubUrl: "{{{RESEND_UNSUBSCRIBE_URL}}}" });
  const text = `${post.text}\n\n${cfg.postal_address}\nUnsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`;
  const b = await resend(env, "POST", "/broadcasts", {
    name, segment_id: SEGMENT_ID, topic_id: TOPIC_ID, from: FROM, reply_to: [REPLY_TO],
    subject: post.subject, preview_text: post.dek, html, text, send: true,
  });
  console.log("broadcast", name, b.status, JSON.stringify(b.data));
}
export const __test = { shell, button };
