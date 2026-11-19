# syntax=docker/dockerfile:1

# One base for every stage, so the Node version that builds the native SQLite
# module is always the one that runs it.
FROM node:26-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
# No install scripts needed: better-sqlite3 ships prebuilt binaries, and
# skipping scripts avoids compiling it from source (slim has no compiler).
RUN npm ci --ignore-scripts

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS run
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/larchbudget.db

# The standalone build contains the server, its dependencies and ./drizzle.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
