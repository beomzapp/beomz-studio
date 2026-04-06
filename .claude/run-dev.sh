#!/bin/bash
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/omarfareda/Desktop/beomz-studio
exec pnpm --filter @beomz-studio/web dev --port 5188
