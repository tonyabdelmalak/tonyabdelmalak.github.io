(function() {
  // Load the original chat widget script from the chat-widget folder
  const script = document.createElement('script');
  script.src = '/chat-widget/assets/chat/widget.js';
  script.onload = () => {
    // After the widget is loaded, attach Enter-to-send handler
    const attachEnterHandler = () => {
      // Look for input or textarea inside the widget input bar
      const input = document.querySelector('.tcw-inputbar input, .tcw-inputbar textarea');
      const btn = document.querySelector('.tcw-inputbar button');
      if (input && btn) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            btn.click();
          }
        });
        return true;
      }
      return false;
    };

    // Try to attach handler immediately and also observe DOM changes
    if (!attachEnterHandler()) {
      const observer = new MutationObserver(() => {
        if (attachEnterHandler()) {
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  };
  document.head.appendChild(script);
})();
