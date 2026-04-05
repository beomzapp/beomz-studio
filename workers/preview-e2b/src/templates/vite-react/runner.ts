import { spawn } from "node:child_process";

const cwd = process.env.BEOMZ_PREVIEW_WORKDIR ?? "/workspace";
const port = process.env.BEOMZ_PREVIEW_PORT ?? "4173";

const child = spawn(
  "/workspace/node_modules/.bin/vite",
  ["--host", "0.0.0.0", "--port", port, "--strictPort"],
  {
    cwd,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  },
);

child.stdout?.on("data", (d: Buffer) => process.stdout.write(d));
child.stderr?.on("data", (d: Buffer) => process.stderr.write(d));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", (err) => {
  console.error("[runner] spawn error:", err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  console.error("[runner] vite exited", { code, signal });
  process.exit(code ?? 1);
});
