(function() {
  // Load the original chat widget script from the chat-widget folder
  const script = document.createElement('script');
  script.src = '/chat-widget/assets/chat/widget.js';
  script.onload = () => {
    // Append-only, after widget initializes:
    (function ensureEnterToSend() {
      const attach = () => {
        const textarea = document.querySelector('.tcw-inputbar textarea');
        const input = document.querySelector('.tcw-inputbar input');
        const el = textarea || input;
        const sendBtn = document.querySelector('.tcw-inputbar button');
        if (!el || !sendBtn) return false;
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
          }
        });
        return true;
      };

      let tries = 0;
      const tick = setInterval(() => {
        if (attach() || ++tries > 60) clearInterval(tick); // try up to ~30s
      }, 500);
    })();
  };
  document.head.appendChild(script);
})();
