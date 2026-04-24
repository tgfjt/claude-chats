import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { claudeChatsApi } from "./src/server/plugin.js";

export default defineConfig({
  plugins: [react(), claudeChatsApi()],
});
