# Backend service for Cloud Run — the family-code webhook receiver/issuer/redeemer
# (backend/src/ + backend/server/). This image contains ONLY the backend: the React app
# (src/, built by Vite) and the content pipeline (pipeline/) are separate deployables and are
# excluded by .dockerignore — keeps the image small and means neither one's dependencies
# (react, @anthropic-ai/sdk, etc.) end up in a service that never uses them.

# ---- 1. compile backend/**/*.ts -> dist-server/**/*.js -----------------------------------
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.server.json ./
COPY backend ./backend
RUN npx tsc -p tsconfig.server.json

# ---- 2. production-only node_modules (no devDependencies, no tsx/vitest/vite/etc.) --------
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- 3. runtime — small, no build tools, no source, no devDependencies --------------------
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./

# Cloud Run injects PORT at runtime (default 8080 if unset — matches backend/server/index.ts's
# own fallback); EXPOSE here is documentation, Cloud Run does not read it.
EXPOSE 8080

# Official node:*-slim images already ship a low-privilege "node" user — no need to create one.
USER node

CMD ["node", "dist-server/backend/server/index.js"]
