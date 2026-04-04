import { describe, it, expect } from "vitest";
import { validateInitialBuild } from "../initialBuildValidator.js";

describe("initialBuildValidator", () => {
  it("passes with valid files in allowed scope", () => {
    const result = validateInitialBuild(
      ["src/pages/Home.tsx", "src/pages/Pricing.tsx", "src/App.tsx"],
      "marketing-website"
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when kernel files are modified", () => {
    const result = validateInitialBuild(
      ["src/pages/Home.tsx", "packages/kernel/src/index.ts"],
      "marketing-website"
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Kernel file modified"))).toBe(true);
  });

  it("fails when files are in denied scope", () => {
    const result = validateInitialBuild(
      ["src/pages/Home.tsx", "node_modules/react/index.js"],
      "marketing-website"
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("denied scope"))).toBe(true);
  });

  it("fails when required files are missing", () => {
    const result = validateInitialBuild(
      ["src/utils/helpers.ts"],
      "marketing-website"
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Required file missing"))).toBe(true);
  });

  it("fails when no files are generated", () => {
    const result = validateInitialBuild([], "marketing-website");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("No files generated"))).toBe(true);
  });

  it("warns when few files generated", () => {
    const result = validateInitialBuild(
      ["src/pages/Home.tsx"],
      "marketing-website"
    );
    expect(result.warnings.some((w) => w.includes("Only 1 file"))).toBe(true);
  });

  it("warns when files are outside allowed scope", () => {
    const result = validateInitialBuild(
      ["src/pages/Home.tsx", "config/settings.json", "src/App.tsx"],
      "marketing-website"
    );
    expect(result.warnings.some((w) => w.includes("outside allowed scope"))).toBe(true);
  });
});
