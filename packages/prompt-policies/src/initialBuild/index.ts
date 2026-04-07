import type { TemplateId } from "@beomz-studio/contracts";

import {
  marketingWebsiteInitialBuildPolicy,
  type InitialBuildPromptPolicy,
} from "./marketingWebsite.js";
import { blogCmsInitialBuildPolicy } from "./blogCms.js";
import { dataTableAppInitialBuildPolicy } from "./dataTableApp.js";
import { ecommerceInitialBuildPolicy } from "./ecommerce.js";
import { mobileAppInitialBuildPolicy } from "./mobileApp.js";
import { onboardingFlowInitialBuildPolicy } from "./onboardingFlow.js";
import { portfolioInitialBuildPolicy } from "./portfolio.js";
import { saasDashboardInitialBuildPolicy } from "./saasDashboard.js";
import { socialAppInitialBuildPolicy } from "./socialApp.js";
import { workspaceTaskInitialBuildPolicy } from "./workspaceTask.js";

export type { InitialBuildPromptPolicy } from "./marketingWebsite.js";
export { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

export const INITIAL_BUILD_PROMPT_POLICIES = [
  marketingWebsiteInitialBuildPolicy,
  saasDashboardInitialBuildPolicy,
  workspaceTaskInitialBuildPolicy,
  mobileAppInitialBuildPolicy,
  socialAppInitialBuildPolicy,
  ecommerceInitialBuildPolicy,
  portfolioInitialBuildPolicy,
  blogCmsInitialBuildPolicy,
  onboardingFlowInitialBuildPolicy,
  dataTableAppInitialBuildPolicy,
] as const satisfies readonly InitialBuildPromptPolicy[];

const policiesByTemplateId = INITIAL_BUILD_PROMPT_POLICIES.reduce<
  Record<TemplateId, InitialBuildPromptPolicy>
>((accumulator, policy) => {
  accumulator[policy.templateId] = policy;
  return accumulator;
}, {} as Record<TemplateId, InitialBuildPromptPolicy>);

export function getInitialBuildPromptPolicy(templateId: TemplateId): InitialBuildPromptPolicy {
  return policiesByTemplateId[templateId];
}

export function listInitialBuildPromptPolicies(): readonly InitialBuildPromptPolicy[] {
  return INITIAL_BUILD_PROMPT_POLICIES;
}
