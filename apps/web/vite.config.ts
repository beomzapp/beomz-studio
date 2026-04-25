import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";

// BEO-580: explicit vendor chunk grouping. Heavy third-party libs that aren't
// needed on the landing page (supabase client, framer-motion, lucide icons,
// the WebContainer SDK) are pulled out of the main entry chunk so the
// initial network payload stays small. Route-level code-splitting (see
// router.ts) keeps the per-route product code in its own dynamic chunk.
function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;

  if (id.includes("@webcontainer/api")) return "vendor-webcontainer";
  if (id.includes("@supabase")) return "vendor-supabase";
  if (id.includes("framer-motion")) return "vendor-framer";
  if (id.includes("lucide-react")) return "vendor-icons";
  if (id.includes("@tanstack/react-router")) return "vendor-router";
  if (
    id.includes("/react/") ||
    id.includes("/react-dom/") ||
    id.includes("/scheduler/")
  ) {
    return "vendor-react";
  }

  return "vendor";
}

export default defineConfig({
  plugins: [tailwindcss(), svgr(), react()],
  build: {
    target: "es2020",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: { manualChunks },
    },
  },
});
