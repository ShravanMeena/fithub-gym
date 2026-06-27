# FitHub backend — serves the API + the web panels (landing/admin/platform).
# Pure-JS deps now (Postgres + GCS), so no native build tools needed.
FROM node:20-bookworm-slim

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend ./backend
COPY landing ./landing

ENV NODE_ENV=production
ENV STATIC_DIR=/app/landing
ENV PORT=4000
EXPOSE 4000

CMD ["node", "backend/src/index.js"]
