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
      },
    },
  ],
};
