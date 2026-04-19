import assert from "node:assert/strict";
import test from "node:test";

import type { StudioFile } from "@beomz-studio/contracts";

process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { upsertEnvFile } = await import("./rewire-neon.js");

test("upsertEnvFile injects VITE_DATABASE_URL for Neon wiring", () => {
  const files: readonly StudioFile[] = [
    {
      path: "App.tsx",
      kind: "route",
      language: "tsx",
      content: "export default function App() { return null; }\n",
      source: "ai",
      locked: false,
    },
  ];

  const next = upsertEnvFile(files, {
    VITE_DATABASE_URL: "postgresql://user:pass@host/db",
    VITE_NEON_AUTH_URL: "https://auth.neon.example",
  });

  const envFile = next.find((file) => file.path === ".env.local");
  assert.ok(envFile);
  assert.match(envFile!.content, /VITE_DATABASE_URL=postgresql:\/\/user:pass@host\/db/);
  assert.match(envFile!.content, /VITE_NEON_AUTH_URL=https:\/\/auth\.neon\.example/);
});
