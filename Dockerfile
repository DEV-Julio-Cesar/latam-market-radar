FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY frontend frontend
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 COOKIE_SECURE=true DATABASE_PATH=/app/data/radar.sqlite
WORKDIR /app
COPY --chown=node:node backend backend
COPY --from=build --chown=node:node /app/frontend/dist frontend/dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
CMD ["node", "backend/server.js"]
