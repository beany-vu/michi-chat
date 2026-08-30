# Multi-stage build for the published image (ghcr.io/<owner>/michi-chat).
# Alpine is safe here: Next's swc and sharp ship musl builds, postgres.js is pure JS.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No DATABASE_URL at build time, deliberately: nothing may talk to a database during
# `next build`. If this step ever starts failing on a missing DB, a page lost its
# force-dynamic marker.
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S michi && adduser -S michi -G michi

# The standalone output carries server.js plus a pruned node_modules traced from app
# imports only.
COPY --from=build --chown=michi:michi /app/.next/standalone ./
COPY --from=build --chown=michi:michi /app/.next/static ./.next/static

# The entrypoint imports drizzle-orm's migrator, which the app itself never imports, so
# standalone tracing omits it. Both packages are dependency-free; copy them whole.
COPY --from=deps --chown=michi:michi /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps --chown=michi:michi /app/node_modules/postgres ./node_modules/postgres
COPY --chown=michi:michi drizzle ./drizzle
COPY --chown=michi:michi docker/entrypoint.mjs ./

USER michi
EXPOSE 3000
CMD ["node", "entrypoint.mjs"]
