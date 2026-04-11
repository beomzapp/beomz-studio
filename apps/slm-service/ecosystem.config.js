module.exports = {
  apps: [
    {
      name: "beomz-slm",
      script: ".venv/bin/uvicorn",
      args: "main:app --host 127.0.0.1 --port 8001 --workers 1",
      cwd: "/root/beomz-studio/apps/slm-service",
      interpreter: "none",
      env: {
        SLM_MODEL: "sentence-transformers/all-MiniLM-L6-v2",
      },
      // Restart on crash but not too aggressively during model cold-start
      min_uptime: "30s",
      max_restarts: 5,
    },
  ],
};
