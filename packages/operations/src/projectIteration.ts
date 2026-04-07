import type {
  InitialBuildInput,
  InitialBuildOutput,
  OperationContract,
} from "@beomz-studio/contracts";

import {
  INITIAL_BUILD_ALLOWED_WRITE_GLOBS,
  INITIAL_BUILD_DENIED_WRITE_GLOBS,
  INITIAL_BUILD_IMMUTABLE_GLOBS,
} from "./initialBuild.js";

export const projectIterationOperation = {
  id: "projectIteration",
  version: 1,
  owner: "platform",
  description:
    "Edit an existing generated application surface in place while preserving unrelated structure, routes, and platform-owned files.",
  allowedTemplates: [
    "marketing-website",
    "saas-dashboard",
    "workspace-task",
    "mobile-app",
    "social-app",
    "ecommerce",
    "portfolio",
    "blog-cms",
    "onboarding-flow",
    "data-table-app",
  ],
  writeScope: {
    allowedGlobs: INITIAL_BUILD_ALLOWED_WRITE_GLOBS,
    deniedGlobs: INITIAL_BUILD_DENIED_WRITE_GLOBS,
    immutableGlobs: INITIAL_BUILD_IMMUTABLE_GLOBS,
  },
  validations: [
    {
      id: "allowed-scope-check",
      description: "Reject edits outside the generated web directories.",
      blocking: true,
    },
    {
      id: "kernel-protection-check",
      description: "Reject any edit that targets platform-owned kernel files.",
      blocking: true,
    },
    {
      id: "iteration-shell-ownership-check",
      description: "Preserve shell-owned navigation/layout boundaries unless the request explicitly changes them.",
      blocking: true,
    },
    {
      id: "iteration-semantic-nav-check",
      description: "Reject duplicate or overlapping navigation destinations introduced during iteration.",
      blocking: true,
    },
    {
      id: "typecheck-generated-surface",
      description: "Edited generated files must pass the workspace TypeScript build before acceptance.",
      blocking: true,
    },
  ],
  examples: [
    "Change the theme to red while keeping the current app structure.",
    "Add a settings page to the current dashboard and surface it in navigation.",
    "Tighten the sidebar width without rebuilding the existing routes.",
    "Add an auth flow without leaking Login or Logout into primary app tabs.",
  ],
} satisfies OperationContract<InitialBuildInput, InitialBuildOutput>;
