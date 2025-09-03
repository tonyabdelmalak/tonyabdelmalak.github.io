# Chat Widget Operator Manual

This widget provides a floating avatar (FAB) that toggles a bottom-right chat panel.
It loads runtime settings from `/assets/chat/config.json` and a persona from `/assets/chat/system.md`.
Requests are proxied through a Cloudflare Worker to protect your GROQ API key.

## Install
1. Ensure these files exist in your repo (GitHub Pages root):
   - `/assets/chat/widget.js`
   - `/assets/chat/widget.css`
   - `/assets/chat/config.json`
   - `/assets/chat/system.md`
   - `/worker.js`
   - `/wrangler.toml`
2. Add the loader before `</body>` on the pages where the chat should appear:
   ```html
   <script defer src="/assets/chat/widget.js" data-chat="enabled"></script>
   ```
   To disable on a page, switch to `data-chat="disabled"` or remove the tag.

## Configure
Edit `/assets/chat/config.json`:
```json
{
  "proxyUrl": "https://chat-widget-proxy.YOURNAME.workers.dev/chat",
  "systemPrompt": "See /assets/chat/system.md",
  "title": "Ask Tony’s Copilot",
  "greeting": "How can I help you explore Tony’s journey, dashboards, or career?",
  "brand": { "accent": "AUTO", "radius": "12px" },
  "rateLimit": 10
}
```
- Set `brand.accent` to a hex (e.g., `#0ea5e9`) to override the default accent.
- Keep `radius` consistent with your site’s design tokens.

## CSP (Content Security Policy)
If your site uses CSP, include your Worker origin in `connect-src`. On GitHub Pages you can add:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline';
               script-src 'self'; connect-src 'self' https://chat-widget-proxy.YOURNAME.workers.dev;">
```

## Cloudflare Worker (Proxy)
- Code: `/worker.js`
- Config: `/wrangler.toml`
- Secrets: run `npx wrangler secret put API_KEY` to set your GROQ key.
- Deploy: `npx wrangler publish worker.js`

## README section (append to root README.md)
```md
## Chat Widget
A floating avatar button (bottom-right, below the hero) toggles a chat panel.
Requests route through a Cloudflare Worker proxy (secrets via environment variables).

- Persona: `/assets/chat/system.md`
- Config: `/assets/chat/config.json`
- Operator manual: `/docs/CHAT_WIDGET.md`
- QA guide: `/docs/TESTING.md`

**Rollback:** remove the loader script and delete `/assets/chat/`.
```
