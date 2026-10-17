import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()], publicDir: false,
  build: { outDir: "generated/everyagent-web", emptyOutDir: true, modulePreload: false,
    rollupOptions: { input: "agent.html" } },
  server: { host: "127.0.0.1", port: 3011, strictPort: true }
});
