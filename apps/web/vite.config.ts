import path from "node:path";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin/vite";
import { defineConfig } from "vite";

const apiTarget = process.env.MERAK_API_URL ?? "http://localhost:3000";
const wsTarget = apiTarget.replace(/^http/, "ws");

export default defineConfig({
  plugins: [
    stylex({
      useCSSLayers: {
        before: ["reset", "ui-sdk", "thirdparty"],
      },
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
      "/api": apiTarget,
      "/ui-sdk": apiTarget,
      "/ws": {
        target: wsTarget,
        ws: true,
      },
      "/mcp": apiTarget,
    },
  },
});
