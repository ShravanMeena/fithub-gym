#!/usr/bin/env bash
# Run the backend locally against Cloud SQL + GCS (prod cloud resources).
# Needs: backend/gcp-key.json (service-account key) and backend/cloud-sql-proxy.
set -e
cd "$(dirname "$0")"
if [ ! -f gcp-key.json ]; then echo "❌ Missing gcp-key.json (download a service-account key into backend/)"; exit 1; fi
echo "▶ starting Cloud SQL proxy…"
./cloud-sql-proxy --credentials-file ./gcp-key.json shravanmeena:us-central1:fithub-db &
PROXY=$!
trap "kill $PROXY 2>/dev/null" EXIT
sleep 4
echo "▶ starting backend…"
node src/index.js
