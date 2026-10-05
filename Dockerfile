# The whole platform as one image (lát I1, Tài 26/09: it must run without renting Vercel or anything like it).
# Next's standalone server, plus the schema and admin scripts, which need only `pg`. Runs as the `node` user.
#
#   docker build -t nfc-platform .
#   docker compose -f deploy/docker-compose.yml up        (app + PostgreSQL + SeaweedFS; see docs/tu-chay.md)
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Standalone output is the default build target (next.config.ts); prepare-standalone copies static files beside it.
RUN node node_modules/next/dist/bin/next build --webpack && node scripts/prepare-standalone.mjs

FROM node:24-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/db ./db
COPY --from=build --chown=node:node /app/scripts/apply-schema.mjs /app/scripts/bootstrap-admin.mjs ./scripts/
USER node
EXPOSE 3000
CMD ["node", "server.js"]
