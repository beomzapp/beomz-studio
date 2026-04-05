import { Template, defaultBuildLogger } from "e2b";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dockerfile = readFileSync(resolve(__dirname, "Dockerfile"), "utf8");

const template = Template({
  fileContextPath: __dirname,
}).fromDockerfile(dockerfile);

async function main() {
  console.log("Building beomz-vite-react template...");
  await Template.build(template, "beomz-vite-react", {
    cpuCount: 2,
    memoryMB: 2048,
    onBuildLogs: defaultBuildLogger(),
  });
  console.log("Done — template 'beomz-vite-react' is ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
