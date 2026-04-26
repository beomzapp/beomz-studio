import "dotenv/config";

import { ensureChatImagesBucket } from "../lib/images/index.js";

await ensureChatImagesBucket();
console.log("[setup] chat-images bucket is ready.");
