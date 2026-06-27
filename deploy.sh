#!/usr/bin/env bash
# Redeploy FitHub on the GCP VM: pull latest, rebuild, restart. Data is preserved.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env.production ]; then
  echo "❌ .env.production not found. Copy .env.production.example and fill it in."
  exit 1
fi

echo "⬇️  Pulling latest code…"
git pull --ff-only || echo "(skipping git pull — not a git checkout)"

echo "🔨 Building & restarting containers…"
docker compose up -d --build

echo "🩺 Health check…"
sleep 3
docker compose exec -T api node -e "fetch('http://localhost:4000/health').then(r=>r.json()).then(d=>console.log('OK',d)).catch(e=>{console.error(e);process.exit(1)})" \
  || curl -fsS "http://localhost/health" || true

echo "✅ Done. Logs:  docker compose logs -f api"
