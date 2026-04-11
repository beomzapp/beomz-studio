import { matchTemplateWithSlm } from "../lib/slmClient.js";
export async function templateSelect(input) {
    return matchTemplateWithSlm({ prompt: input.prompt, plan: input.plan });
}
