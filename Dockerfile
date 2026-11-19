# syntax=docker/dockerfile:1

# One base for every stage, so every stage uses the same Node version.
FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS run
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# The standalone build contains the server and its dependencies.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
