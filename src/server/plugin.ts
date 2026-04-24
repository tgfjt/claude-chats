import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import { indexHandler, sessionHandler } from "./handlers.js";

function attach(server: ViteDevServer | PreviewServer): void {
  server.middlewares.use("/api/index", indexHandler);
  server.middlewares.use("/api/session", sessionHandler);
}

export function claudeChatsApi(): Plugin {
  return {
    name: "claude-chats-api",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
