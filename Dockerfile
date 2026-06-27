# FitHub backend — serves the API + the web panels (landing/admin/platform).
FROM node:20-bookworm-slim

# Build tools for better-sqlite3 native module (falls back to prebuilt if available).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend deps first (better layer caching).
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# App code + static web panels.
COPY backend ./backend
COPY landing ./landing

ENV NODE_ENV=production
ENV STATIC_DIR=/app/landing
ENV PORT=4000
EXPOSE 4000

# SQLite DB + uploads live here — mount a persistent volume at this path.
VOLUME ["/app/backend/data"]

CMD ["node", "backend/src/index.js"]
