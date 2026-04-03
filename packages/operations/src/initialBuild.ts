import type { InitialBuildInput, InitialBuildOutput, OperationContract } from "@beomz-studio/contracts";

export const INITIAL_BUILD_ALLOWED_WRITE_GLOBS = [
  "apps/web/src/generated/**",
  "apps/web/src/app/generated/**",
  "apps/web/src/components/generated/**",
  "apps/web/src/styles/generated/**",
  "apps/web/public/generated/**",
] as const;

export const INITIAL_BUILD_DENIED_WRITE_GLOBS = [
  "packages/kernel/**",
  "packages/contracts/**",
  "packages/templates/**",
  "packages/operations/**",
  "packages/studio-db/**",
  "packages/db/**",
  "packages/engine/**",
  "apps/api/**",
  "apps/web/src/router.ts",
  "apps/web/src/app/routes/**",
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
] as const;

export const INITIAL_BUILD_IMMUTABLE_GLOBS = [
  "packages/kernel/**",
] as const;

export const initialBuildOperation = {
  id: "initialBuild",
  version: 1,
  owner: "platform",
  description:
    "Create the first generated application surface inside approved web-generated directories only.",
  allowedTemplates: [
    "marketing-website",
    "saas-dashboard",
    "workspace-task",
  ],
  writeScope: {
    allowedGlobs: INITIAL_BUILD_ALLOWED_WRITE_GLOBS,
    deniedGlobs: INITIAL_BUILD_DENIED_WRITE_GLOBS,
    immutableGlobs: INITIAL_BUILD_IMMUTABLE_GLOBS,
  },
  validations: [
    {
      id: "allowed-scope-check",
      description: "Reject writes outside the generated web directories.",
      blocking: true,
    },
    {
      id: "kernel-protection-check",
      description: "Reject any write that targets platform-owned kernel files.",
      blocking: true,
    },
    {
      id: "template-contract-check",
      description: "Ensure generated routes align with the selected typed template definition.",
      blocking: true,
    },
    {
      id: "typecheck-generated-surface",
      description: "Generated files must pass the workspace TypeScript build before acceptance.",
      blocking: true,
    },
  ],
  examples: [
    "Build a public launch website for a B2B SaaS product.",
    "Build an authenticated team dashboard for customer operations.",
    "Build a collaborative task workspace for an internal team.",
  ],
} satisfies OperationContract<InitialBuildInput, InitialBuildOutput>;
