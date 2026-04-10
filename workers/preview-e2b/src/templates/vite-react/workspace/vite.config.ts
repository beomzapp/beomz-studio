// @ts-nocheck
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src"),
    },
  },
  server: {
    allowedHosts: true,
    host: true,
    port: Number(process.env.BEOMZ_PREVIEW_PORT ?? 4173),
    strictPort: true,
  },
  preview: {
    allowedHosts: true,
    host: "0.0.0.0",
    port: Number(process.env.BEOMZ_PREVIEW_PORT ?? 4173),
    strictPort: true,
  },
});
