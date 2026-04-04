import { describe, it, expect } from "vitest";
import { validateShellIntegrity, shellValidationResult } from "../shellValidator.js";

describe("shellValidator", () => {
  it("passes when no kernel files are modified", () => {
    const result = validateShellIntegrity([
      "src/pages/Home.tsx",
      "src/components/Button.tsx",
    ]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("detects direct kernel file modification", () => {
    const result = validateShellIntegrity([
      "src/pages/Home.tsx",
      "packages/kernel/src/index.ts",
    ]);
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].path).toBe("packages/kernel/src/index.ts");
    expect(result.violations[0].reason).toContain("frozen kernel file");
  });

  it("detects new files created in kernel directory", () => {
    const result = validateShellIntegrity([
      "packages/kernel/src/hacked.ts",
    ]);
    expect(result.valid).toBe(false);
    expect(result.violations[0].reason).toContain("frozen kernel directory");
  });

  it("detects multiple kernel violations", () => {
    const result = validateShellIntegrity([
      "packages/kernel/src/index.ts",
      "packages/kernel/src/shell/AppShell.tsx",
      "packages/kernel/package.json",
    ]);
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(3);
  });

  it("shellValidationResult returns standard format", () => {
    const result = shellValidationResult([
      "packages/kernel/src/index.ts",
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("SHELL_VIOLATION");
  });

  it("shellValidationResult passes clean input", () => {
    const result = shellValidationResult(["src/App.tsx"]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
