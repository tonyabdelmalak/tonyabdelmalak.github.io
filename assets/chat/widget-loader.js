(function() {
  if (window.__LF_WIDGET_MOUNTED__) return;
  window.__LF_WIDGET_MOUNTED__ = true;

  const proxyUrl = "PROXY_URL_HERE"; // Replace with your Worker URL
  const flowId   = "FLOW_ID_HERE";   // Replace with your Flow ID

  const el = document.createElement("langflow-chat");
  el.setAttribute("host_url", proxyUrl);
  el.setAttribute("flow_id", flowId);
  el.setAttribute("api_key", "skip"); // Client value ignored; proxy injects real key

  // Branding & layout
  el.setAttribute("window_title", "Ask Tony’s Copilot");
  el.setAttribute("chat_position", "bottom-right");
  el.setAttribute("height", "560");
  el.setAttribute("width",  "380");
  el.setAttribute("chat_window_style", JSON.stringify({ borderRadius: "16px" }));

  const mount = () => document.body.appendChild(el);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
