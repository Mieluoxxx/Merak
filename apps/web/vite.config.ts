import path from "node:path";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    stylex({
      useCSSLayers: true,
      externalPackages: ["@merak/ui"],
      unstable_moduleResolution: {
        type: "commonJS",
        rootDir: path.resolve(import.meta.dirname, "../.."),
      },
    }),
    react(),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/ui-sdk": "http://localhost:3000",
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
      "/mcp": "http://localhost:3000",
    },
  },
});
