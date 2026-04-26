import type { AuthTier } from "./shared.js";

function buildMockUser(email: string) {
  return {
    id: `mock-${Date.now()}`,
    email,
    role: "user",
  };
}

export function createMockAuthTier(): AuthTier {
  return {
    kind: "mock",
    async signup(email) {
      return {
        user: buildMockUser(email),
        token: "mock-token",
      };
    },
    async login(email) {
      return {
        user: buildMockUser(email),
        token: "mock-token",
      };
    },
    async logout() {
      return { success: true };
    },
    async me() {
      return {
        user: {
          id: "mock-user",
          email: "demo@example.com",
          role: "user",
        },
      };
    },
  };
}
