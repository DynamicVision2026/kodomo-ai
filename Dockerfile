# Backend service for Cloud Run — the family-code webhook receiver/issuer/redeemer
# (backend/src/ + backend/server/). This image contains ONLY the backend: the React app
# (src/, built by Vite) and the content pipeline (pipeline/) are separate deployables and are
# simply never COPYed below — every stage names exactly the paths it needs (`tsconfig.server.json`,
# `backend/`), never a blanket `COPY . .` scoped down by a dockerignore file. That's deliberate:
# `.dockerignore` (repo root) is shared by all three Cloud Run images now (Dockerfile,
# Dockerfile.frontend, Dockerfile.admin) and only ever excludes things NONE of them need — Google
# Cloud Build's own builder doesn't support per-Dockerfile-named ignore overrides (see
# .dockerignore's own header comment for the incident this fixed), so explicit COPY lists are the
# only thing that reliably scopes each image's contents, everywhere this gets built.

# ---- 1. compile backend/**/*.ts -> dist-server/**/*.js -----------------------------------
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.server.json ./
COPY backend ./backend
# `shared/` (progressMerge.ts, freeMissions.ts, presetIds.ts) is a REAL relative import target
# for backend/src (e.g. backend/src/schema.ts, backend/src/access.ts) — not optional context,
# omitting it fails this exact step with TS2307 "Cannot find module '../../shared/...'". Found
# and fixed alongside the frontend/admin images' own identical class of packaging bug (each
# Dockerfile now names every real import target it needs; nothing relies on an ignore file to
# narrow scope — see .dockerignore's own header comment).
COPY shared ./shared
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
