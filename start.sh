#!/usr/bin/env sh
# Installs what the app needs (the first time, or when it changed) and starts it in your browser.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed. Install the LTS version from https://nodejs.org and run this again."
  exit 1
fi
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 20 ]; then
  echo "Node.js 20 or newer is needed (you have $(node -v)). Get the LTS version from https://nodejs.org."
  exit 1
fi

echo "Checking dependencies (the first run can take a few minutes)..."
npm install --no-audit --no-fund

echo "Starting Go Flashcards..."
exec npm run web
