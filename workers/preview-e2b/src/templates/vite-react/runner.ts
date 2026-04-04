import { spawn } from "node:child_process";

const cwd = process.env.BEOMZ_PREVIEW_WORKDIR ?? "/workspace";
const port = process.env.BEOMZ_PREVIEW_PORT ?? "4173";

const child = spawn(
  "pnpm",
  ["exec", "vite", "--host", "0.0.0.0", "--port", port, "--strictPort"],
  {
    cwd,
    env: process.env,
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
