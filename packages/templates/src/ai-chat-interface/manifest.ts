import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "ai-chat-interface",
  name: "AI Chat Interface",
  description: "Chat interface with AI assistant, message history, typing indicator, and prompt suggestions",
  shell: "website",
  accentColor: "#A855F7",
  tags: [
    "ai", "chat", "assistant", "messages", "conversation", "gpt",
    "dark-theme", "creative", "prompt", "interface", "bot",
  ],
} as const satisfies TemplateManifest;
