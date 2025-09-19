(function () {
  const init = (opts) => {
    const cfg = {
      proxyUrl: opts.proxyUrl,
      title: opts.title || "Copilot",
      greeting: opts.greeting || "How can I help?",
      avatar: opts.avatar || "/assets/img/profile-img.jpg"
    };

    // UI
    const container = document.createElement("div");
    container.className = "copilot-container";
    container.innerHTML = `
      <button class="copilot-launch"></button>
      <div class="copilot-panel">
        <div class="copilot-header">${cfg.title}</div>
        <div class="copilot-body"><div>${cfg.greeting}</div></div>
        <div class="copilot-input">
          <input type="text" placeholder="Type a message..." />
          <button>Send</button>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const panel = container.querySelector(".copilot-panel");
    const launch = container.querySelector(".copilot-launch");
    const input = container.querySelector("input");
    const send = container.querySelector("button");

    launch.addEventListener("click", () => {
      panel.style.display = panel.style.display === "flex" ? "none" : "flex";
      panel.style.flexDirection = "column";
    });

    const body = panel.querySelector(".copilot-body");
    const post = async (msg) => {
      body.insertAdjacentHTML("beforeend", `<div><b>You:</b> ${msg}</div>`);
      input.value = "";
      try {
        const res = await fetch(cfg.proxyUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: msg }] }),
        });
        const data = await res.json();
        const reply = data.reply || data?.choices?.[0]?.message?.content || "...";
        body.insertAdjacentHTML("beforeend", `<div><b>Agent:</b> ${reply}</div>`);
        body.scrollTop = body.scrollHeight;
      } catch (e) {
        body.insertAdjacentHTML("beforeend", `<div><b>Agent:</b> (network error)</div>`);
      }
    };

    send.addEventListener("click", () => post(input.value.trim()));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") post(input.value.trim());
    });
  };

  window.TonyChatWidget = { init };
})();
