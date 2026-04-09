#!/bin/bash
# Usage: ./scripts/bootstrap-worker.sh
# Run this on a fresh Ubuntu 24.04 DO droplet as root

set -euo pipefail

echo "=== Beomz Studio Temporal Worker Bootstrap ==="

if [ "${EUID}" -ne 0 ]; then
  echo "Please run this script as root."
  exit 1
fi

# Install Node 20
apt-get update
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git

# Install pnpm + pm2
npm install -g pnpm@9.15.4 pm2

# Add swap (prevents OOM during builds)
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap enabled"
fi

# Clone repo
cd /root
git clone https://github.com/beomzapp/beomz-studio.git
cd /root/beomz-studio

# Install deps
pnpm install --no-frozen-lockfile

# Build worker
pnpm --filter @beomz-studio/temporal-worker... build

echo ""
echo "=== Bootstrap complete ==="
echo "Next steps:"
echo "1. Copy .env file: scp root@64.23.216.207:~/beomz-studio/workers/temporal/.env ~/beomz-studio/workers/temporal/.env"
echo "2. Start worker: set -a && source workers/temporal/.env && set +a && pm2 start workers/temporal/dist/worker.js --name temporal-worker && pm2 save"
echo "3. Enable PM2 startup: pm2 startup && pm2 save"
echo "4. Add IP to WORKER_HOSTS GitHub variable"
