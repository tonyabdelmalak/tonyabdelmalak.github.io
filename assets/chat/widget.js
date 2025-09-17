/* chat-widget/assets/chat/widget.js
   Minimal chat widget with first-person voice and "intro once" behavior.
   - Loads proxyUrl + UI + system rules from config.json
   - Maintains conversation history (no more repeated intros)
   - Client-only greeting bubble (not sent to the model)
*/
(function () {
  const W = window, D = document;
  if (!W.TonyChatWidget) W.TonyChatWidget = {};

  // --- First-person system rules (no repeated intro) ---
  function buildSystemPrompt(isFirstTurn) {
    const lines = [
      "You are Tony speaking in FIRST PERSON. Always use 'I' and 'my'.",
      "Introduce yourself ONLY on the FIRST turn of a NEW session.",
      "Do NOT repeat any welcome/intro on later turns unless explicitly asked 'who are you' or 'what is this?'.",
      "Tone: professional, direct, approachable. Use contractions. Short, active sentences.",
      "If user repeats a broad ask (e.g., 'dashboards'), go deeper (steps, choices, tradeoffs, outcomes) instead of re-introducing.",
      "When asked about dashboards: data sources → prep → modeling → visuals → interactivity → impact.",
      "If context is unclear, ask one focused question, then proceed with best-practice guidance."
    ];
    if (!isFirstTurn) {
      lines.push("This is NOT the first turn of the session; do NOT introduce yourself.");
    }
    return lines.join("\n");
  }

  // --- tiny helpers ---
  function el(tag, cls) { const n = D.createElement(tag); if (cls) n.className
