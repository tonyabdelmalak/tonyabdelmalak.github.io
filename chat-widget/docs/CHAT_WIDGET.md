# Chat Widget Installation and Testing

This guide describes how to add the Copilot widget to your site and test it.

## Installation

1. Ensure your site has a `<script>` and `<link>` snippet referencing the widget:
   ```html
   <!-- Tony’s Copilot widget -->
   <link rel="stylesheet" href="/chat-widget/assets/chat/widget.css">
   <script src="/chat-widget/assets/chat/widget.js" defer></script>
   <script>
     window.TonyChatWidget?.init({
       mode: "floating",
       position: "bottom-right",
       avatar: "/assets/img/profile-img.jpg",
       configPath: "/chat-widget/assets/chat/config.json",
       systemPath: "/chat-widget/assets/chat/system.md"
     });
   </script>
   ```

2. Add the `chat-widget` folder (including `assets`, `docs`, and `worker.js`) to your repository root.

## Testing

After pushing the widget files:

- Perform a hard refresh (Cmd+Shift+R or Ctrl+Shift+R) to clear cached assets.
- Confirm the launcher appears bottom-right on all pages.
- Click the avatar to open the panel and send a test message.
- Verify no layout or content shifts occur.

This file is used to document the widget and includes the snippet used in `index.html`.
