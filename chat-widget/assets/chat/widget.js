/* ---------- THEME/FORMAT SHIM (safe to paste near top) ---------- */
function applyTheme(cfg = {}) {
  // read accent + radius from config.json and apply to CSS variables
  const accent = cfg.accent || '#4f46e5';
  const radius = cfg.radius || '14px';
  const root = document.documentElement;
  root.style.setProperty('--chat-accent', accent);
  root.style.setProperty('--chat-radius', radius);
}

/* OPTIONAL: helper to build the minimal DOM structure if you need it.
   If your widget already renders the same IDs/classes, skip this. */
function ensureChatShell() {
  if (document.querySelector('.cw-wrap')) return;

  const root = document.querySelector('#chat-widget-root') || (() => {
    const el = document.createElement('div');
    el.id = 'chat-widget-root';
    document.body.appendChild(el);
    return el;
  })();

  root.insertAdjacentHTML('beforeend', `
    <button class="cw-launcher" id="cw-launch">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3C7.03 3 3 6.58 3 11a7.6 7.6 0 0 0 2.1 5.1l-.7 3.2c-.1.5.36.95.85.83l3.7-.93A10.8 10.8 0 0 0 12 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" fill="currentColor"/>
      </svg>
    </button>

    <div class="cw-wrap" id="cw-wrap">
      <div class="cw-head">
        <button class="cw-close" id="cw-close" aria-label="Close">✕</button>
        <h3 class="cw-title" id="cw-title">Chat</h3>
        <p class="cw-sub" id="cw-sub">We are online!</p>
      </div>
      <div class="cw-body">
        <div class="cw-scroll" id="cw-scroll"></div>
        <div class="cw-note" id="cw-note"></div>
        <form class="cw-input" id="cw-form">
          <input id="cw-text" type="text" autocomplete="off" placeholder="Enter your message..." />
          <button class="cw-send" id="cw-send" type="submit">Send</button>
        </form>
      </div>
    </div>
  `);

  // minimal open/close if you don't already manage it
  const wrap = document.getElementById('cw-wrap');
  const openBtn = document.getElementById('cw-launch');
  const closeBtn = document.getElementById('cw-close');
  openBtn?.addEventListener('click', () => { wrap.style.display = 'block'; openBtn.classList.add('cw-hidden'); });
  closeBtn?.addEventListener('click', () => { wrap.style.display = 'none'; openBtn.classList.remove('cw-hidden'); });
}
/* ---------- END THEME/FORMAT SHIM ---------- */


/* ===== Container ===== */
.copilot-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 340px;
  max-height: 560px;
  display: flex;
  flex-direction: column;
  border: 1px solid #dcdcdc;
  border-radius: 14px;
  background: #fff;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  font-size: 14px;
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
  overflow: hidden;
  z-index: 2147483000 !important; /* always on top */
}

/* ===== Header ===== */
.copilot-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f7f8fa;
  border-bottom: 1px solid #e8e8e8;
}

.copilot-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.copilot-title {
  font-weight: 700;
  font-size: 15px;
  color: #0f172a;
  flex: 1 1 auto;
}

/* Close (X) button in header */
.copilot-close {
  appearance: none;
  border: none;
  background: transparent;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  line-height: 28px;
  color: #64748b;
}
.copilot-close:hover { background: #eef2f7; color: #334155; }

/* ===== Messages area ===== */
.copilot-messages {
  flex: 1 1 auto;
  padding: 12px;
  overflow-y: auto;
  background: #fff;
}

/* One extra space between turns for readability */
.copilot-msg {
  margin: 0 0 12px 0;           /* <— space between bubbles */
  line-height: 1.45;
  word-wrap: break-word;
}

/* Label (“Agent:” / “You:”) — bold + color-coded */
.copilot-label {
  font-weight: 700;              /* <— bold the speaker */
  margin-right: 6px;
}

.copilot-msg.agent .copilot-label { color: #4338ca; } /* indigo */
.copilot-msg.user  .copilot-label { color: #2563eb; } /* blue   */

/* Optional subtle background for Agent to help scan */
.copilot-msg.agent {
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  padding: 8px 10px;
}

/* ===== Input row ===== */
.copilot-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid #e8e8e8;
  background: #fff;
}

.copilot-input {
  flex: 1 1 auto;
  height: 42px;
  border: 1px solid #d1d5db;
  border-radius: 9999px;
  padding: 0 14px;
  font-size: 14px;
  outline: none;
}
.copilot-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99,102,241,.18);
}

/* Send button — circle with upward arrow */
.copilot-send {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: #6366f1;      /* indigo */
  color: #fff;
  font-size: 18px;
  cursor: pointer;
}
.copilot-send:hover { background: #4f46e5; }

/* ===== Launcher (floating button) ===== */
.copilot-launch {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: #6366f1;
  box-shadow: 0 10px 28px rgba(0,0,0,.22);
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 2147483000 !important;
}

.copilot-launch img {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,.9);
}

.copilot-hidden { display: none !important; }
