const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env.local") });

// PM2 ecosystem config for beomz-api.
// BEO-418: pm2 reload should give active SSE streams time to drain while the
// replacement process comes up and signals readiness.
module.exports = {
  apps: [
    {
      name: "beomz-api",
      script: "dist/bootstrap.js",
      cwd: "/root/beomz-studio/apps/api",
      interpreter: "node",
      kill_timeout: 30000,
      // Use SIGTERM so our server.ts handler fires
      kill_signal: "SIGTERM",
      wait_ready: true,
      listen_timeout: 5000,
      env: {
        NODE_ENV: "production",
        IPQS_API_KEY: process.env.IPQS_API_KEY,
        TAVILY_API_KEY: process.env.TAVILY_API_KEY,
      },
    },
  ],
};
