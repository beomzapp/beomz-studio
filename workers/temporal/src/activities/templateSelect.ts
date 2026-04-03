import type { TemplateSelectActivityInput, TemplateSelectionResult } from "../shared/types.js";
import { selectInitialBuildTemplate } from "../shared/templateSelection.js";

export async function templateSelect(
  input: TemplateSelectActivityInput,
): Promise<TemplateSelectionResult> {
  return selectInitialBuildTemplate(input);
}
