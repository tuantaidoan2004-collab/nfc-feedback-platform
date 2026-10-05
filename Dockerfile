# The whole platform as one image (lát I1, Tài 26/09: it must run without renting Vercel or anything like it).
# Next's standalone server, plus the schema and admin scripts, which need only `pg`. Runs as the `node` user.
#
#   docker build -t nfc-platform .
#   docker compose -f deploy/docker-compose.yml up        (app + PostgreSQL + SeaweedFS; see docs/tu-chay.md)
FROM node:24-bookworm-slim AS deps
# Not /app: the project has a route folder named app/app, and Next built under /app serves that route at / too -- the front
# page answered with a redirect to sign in (self-host CI, 05/10). Any other folder builds correctly.
WORKDIR /srv/nfc
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Standalone output is the default build target (next.config.ts); prepare-standalone copies static files beside it.
RUN node node_modules/next/dist/bin/next build --webpack && node scripts/prepare-standalone.mjs

FROM node:24-bookworm-slim AS run
WORKDIR /srv/nfc
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /srv/nfc/.next/standalone ./
COPY --from=build --chown=node:node /srv/nfc/db ./db
COPY --from=build --chown=node:node /srv/nfc/scripts/apply-schema.mjs /srv/nfc/scripts/bootstrap-admin.mjs ./scripts/
USER node
EXPOSE 3000
CMD ["node", "server.js"]
