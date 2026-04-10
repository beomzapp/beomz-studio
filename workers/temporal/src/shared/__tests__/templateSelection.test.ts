import assert from "node:assert/strict";
import test from "node:test";

import { getTemplateDefinition } from "@beomz-studio/templates";

import { buildGeneratedScaffoldFiles } from "../generatedSurface.js";
import { selectInitialBuildTemplate } from "../templateSelection.js";

test("defaults calculator-like prompts to the workspace task template", () => {
  const selection = selectInitialBuildTemplate({
    prompt: "build a simple calculator app",
  });

  assert.equal(selection.template.id, "workspace-task");
  assert.ok(selection.scores["workspace-task"] > selection.scores["marketing-website"]);
});

test("keeps explicit landing page prompts on the marketing template", () => {
  const selection = selectInitialBuildTemplate({
    prompt: "build a landing page for my SaaS homepage",
  });

  assert.equal(selection.template.id, "marketing-website");
  assert.ok(selection.scores["marketing-website"] > selection.scores["workspace-task"]);
});

test("includes lib/utils.ts in every generated scaffold", () => {
  const scaffoldFiles = buildGeneratedScaffoldFiles({
    project: { name: "Calculator" },
    template: getTemplateDefinition("workspace-task"),
  });

  const utilsFile = scaffoldFiles.find((file) => file.path === "apps/web/src/lib/utils.ts");
  assert.ok(utilsFile);
  assert.match(utilsFile.content, /export function cn\(/);
});
