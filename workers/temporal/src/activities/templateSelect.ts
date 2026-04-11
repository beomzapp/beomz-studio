import type { TemplateSelectActivityInput, TemplateSelectionResult } from "../shared/types.js";
import { matchTemplateWithSlm } from "../lib/slmClient.js";

export async function templateSelect(
  input: TemplateSelectActivityInput,
): Promise<TemplateSelectionResult> {
  return matchTemplateWithSlm({ prompt: input.prompt, plan: input.plan });
}
