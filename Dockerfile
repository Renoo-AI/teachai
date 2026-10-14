# Teach.ai on any Docker host with a persistent disk (Render, Railway, Fly, a VPS).
# Chromium is needed for PDF export. Mount a persistent volume at /app/data (exams, coupons, waiting list).
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    TEACHAI_BROWSER_PATH=/usr/bin/chromium \
    TRUST_PROXY=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
