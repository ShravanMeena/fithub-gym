# FitHub backend — serves the API + the web panels (landing/admin/platform).
FROM node:20-bookworm-slim

# ffmpeg: transcode uploaded videos to web-optimized MP4 (faststart) so they
# stream/play instantly on all devices.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

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
