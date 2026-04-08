import { selectInitialBuildTemplate } from "../shared/templateSelection.js";
export async function templateSelect(input) {
    return selectInitialBuildTemplate(input);
}
