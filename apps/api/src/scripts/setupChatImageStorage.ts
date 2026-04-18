import "dotenv/config";

import { ensureChatImagesBucket } from "../lib/chatImageStorage.js";

await ensureChatImagesBucket();
console.log("[setup] chat-images bucket is ready.");
