import { describe, expect, it } from "vitest";

import { validateGeneratedFileGuardrails } from "../generatedFileGuardrails.js";

describe("generatedFileGuardrails", () => {
  it("passes when generated files only use approved imports and default exports", () => {
    const result = validateGeneratedFileGuardrails([
      {
        content: `import React from "react";
import AppShell from "@/components/generated/marketing-website/AppShell";
import { Sparkles } from "lucide-react";

export default function HomePage() {
  return <AppShell currentPath="/" title="Home"><Sparkles /></AppShell>;
}
`,
        kind: "route",
        language: "tsx",
        locked: false,
        path: "apps/web/src/app/generated/marketing-website/home.tsx",
        source: "ai",
      },
      {
        content: `import { type ReactNode } from "react";

function AppShell({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

export default AppShell;
export { AppShell };
`,
        kind: "layout",
        language: "tsx",
        locked: false,
        path: "apps/web/src/components/generated/marketing-website/AppShell.tsx",
        source: "platform",
      },
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when AppShell is missing a default export", () => {
    const result = validateGeneratedFileGuardrails([
      {
        content: `export function AppShell() {
  return <div />;
}
`,
        kind: "layout",
        language: "tsx",
        locked: false,
        path: "apps/web/src/components/generated/marketing-website/AppShell.tsx",
        source: "platform",
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("missing a default export"))).toBe(true);
  });

  it("fails when generated files import react-icons", () => {
    const result = validateGeneratedFileGuardrails([
      {
        content: `import { FiArrowRight } from "react-icons/fi";

export default function HomePage() {
  return <FiArrowRight />;
}
`,
        kind: "route",
        language: "tsx",
        locked: false,
        path: "apps/web/src/app/generated/marketing-website/home.tsx",
        source: "ai",
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("banned package"))).toBe(true);
  });

  it("fails when generated files import unsupported bare packages", () => {
    const result = validateGeneratedFileGuardrails([
      {
        content: `import { motion } from "motion/react";

export default function HomePage() {
  return <motion.div />;
}
`,
        kind: "route",
        language: "tsx",
        locked: false,
        path: "apps/web/src/app/generated/marketing-website/home.tsx",
        source: "ai",
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("unavailable sandbox package"))).toBe(true);
  });
});
