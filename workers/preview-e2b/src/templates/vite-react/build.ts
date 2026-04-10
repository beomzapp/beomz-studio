import { Template, defaultBuildLogger } from "e2b";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_VITE_REACT_TEMPLATE_NAME,
  VITE_REACT_TEMPLATE_VERSION,
} from "./templateVersion.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dockerfile = readFileSync(resolve(__dirname, "Dockerfile"), "utf8");

const template = Template({
  fileContextPath: __dirname,
}).fromDockerfile(dockerfile);

async function main() {
  console.log(
    `Building ${DEFAULT_VITE_REACT_TEMPLATE_NAME} template (version ${VITE_REACT_TEMPLATE_VERSION})...`,
  );
  await Template.build(template, DEFAULT_VITE_REACT_TEMPLATE_NAME, {
    cpuCount: 2,
    memoryMB: 2048,
    onBuildLogs: defaultBuildLogger(),
  });
  console.log(`Done — template '${DEFAULT_VITE_REACT_TEMPLATE_NAME}' is ready.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
