// PM2 ecosystem config for beomz-api.
// Sets kill_timeout to 185s so PM2 waits for the SIGTERM/SIGINT drain handler
// (max 180s) before sending SIGKILL during deploys.
module.exports = {
  apps: [
    {
      name: "beomz-api",
      script: "dist/bootstrap.js",
      cwd: "/root/beomz-studio/apps/api",
      interpreter: "node",
      // Give graceful shutdown handler 185s before SIGKILL (handler waits up to 180s)
      kill_timeout: 185000,
      // Use SIGTERM so our server.ts handler fires
      kill_signal: "SIGTERM",
      // 60s for the process to call process.send('ready') before pm2 considers
      // the reload failed. server.ts sends ready in the serve() callback.
      listen_timeout: 60000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
