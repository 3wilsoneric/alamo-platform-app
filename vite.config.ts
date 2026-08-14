import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:3002";

export default defineConfig({
  plugins: [react()],
  build: {
    // Vite's generated dependency-preload wrapper can leave React.lazy routes
    // pending even after every chunk returns 200. Direct imports are both
    // smaller and more reliable for this authenticated SPA.
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/react-router-dom/")) {
            return "vendor-react";
          }
          if (id.includes("/@azure/") || id.includes("/@databricks/")) {
            return "vendor-data";
          }
          if (id.includes("/lucide-react/")) {
            return "vendor-icons";
          }
          return undefined;
        }
      }
    }
  },
  server: {
    port: 3001,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  },
  preview: {
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  }
});
