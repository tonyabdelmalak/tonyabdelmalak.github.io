# Chat Widget QA Guide

## Smoke
- Page loads without console errors.
- FAB appears bottom-right, below hero.
- Clicking FAB toggles the chat panel.
- `data-chat="disabled"` prevents the FAB.

## Functional
- Typing + Enter sends; Shift+Enter adds newline.
- Assistant replies render; errors show friendly message.
- Rate limit respected (`rateLimit` per rolling minute).

## CSP
- With CSP enabled, network calls to your Worker succeed.
- No blocked requests in DevTools console.

## Accessibility
- FAB has `aria-label`, toggles `aria-expanded`.
- Panel uses `aria-hidden` and `role="log"` on messages.
- Focus moves to textarea on open; Esc closes (optional).

## Cross-Browser
- Latest Chrome, Edge, Firefox, Safari (desktop & mobile).
- iOS Safari and Android Chrome.

## Performance
- Widget script is deferred and initializes after DOM ready.
- No layout thrash; panel is `display:flex` only when open.

## Rollback
- Remove the loader script tag and delete `/assets/chat/`.
