import assert from "node:assert/strict";
import test from "node:test";

import { getTemplateDefinition } from "@beomz-studio/templates";

import { validateBuild } from "../validateBuild.js";
import { buildGeneratedScaffoldFiles } from "../../shared/generatedSurface.js";

test("accepts the generated lib/utils scaffold path inside the initial build scope", async () => {
  const template = getTemplateDefinition("workspace-task");
  const files = buildGeneratedScaffoldFiles({
    project: { name: "Calculator" },
    template,
  });

  const result = await validateBuild({
    draft: {
      files,
      previewEntryPath: template.previewEntryPath,
      source: "ai",
      summary: "Generated scaffold files for Calculator.",
      warnings: [],
    },
    template,
  });

  assert.equal(
    result.errors.some((error) =>
      error.path === "apps/web/src/lib/utils.ts"
      && error.code === "write-scope-denied"
    ),
    false,
  );
});
