// @ts-nocheck
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.BEOMZ_PREVIEW_PORT ?? 4173),
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.BEOMZ_PREVIEW_PORT ?? 4173),
    strictPort: true,
  },
});
