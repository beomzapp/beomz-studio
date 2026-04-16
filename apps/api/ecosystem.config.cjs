// PM2 ecosystem config for beomz-api.
// BEO-318: kill_timeout reduced to 35s — graceful shutdown now just writes
// server_restarting events to DB (fast) then exits, no 180s drain needed.
// wait_ready: true ensures PM2 doesn't consider the reload done until the new
// process calls process.send('ready') (done in server.ts serve() callback).
module.exports = {
  apps: [
    {
      name: "beomz-api",
      script: "dist/bootstrap.js",
      cwd: "/root/beomz-studio/apps/api",
      interpreter: "node",
      // 35s for graceful shutdown to write server_restarting events then exit.
      // Server exits via process.exit(0) after DB writes — well under 35s.
      kill_timeout: 35000,
      // Use SIGTERM so our server.ts handler fires
      kill_signal: "SIGTERM",
      // Wait for process.send('ready') before marking reload as successful
      wait_ready: true,
      // 60s for the process to call process.send('ready') before pm2 considers
      // the reload failed. server.ts sends ready in the serve() callback.
      listen_timeout: 60000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
