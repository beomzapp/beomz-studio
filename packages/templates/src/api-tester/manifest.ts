import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "api-tester",
  name: "API Tester",
  description: "REST API testing tool with method selector, headers, body, and response viewer",
  shell: "dashboard",
  accentColor: "#3B82F6",
  tags: [
    "api", "tester", "rest", "http", "developer", "request",
    "light-theme", "tool", "response", "headers", "postman",
  ],
} as const satisfies TemplateManifest;
