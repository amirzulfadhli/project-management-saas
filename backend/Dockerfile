# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS prisma-tooling
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM prisma-tooling AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
# Prisma's config is loaded by `generate`, although generation does not connect
# to PostgreSQL. Keep this syntactically valid, non-secret value in the build
# stage only; runtime and migration stages receive DATABASE_URL explicitly.
ENV DATABASE_URL=postgresql://prisma-build:prisma-build@127.0.0.1:5432/prisma_build
RUN npx prisma generate && npm run build

# Run this target as a one-shot release job before starting the API.
FROM dependencies AS migration
COPY prisma.config.ts ./
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

FROM prisma-tooling AS production-dependencies
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional && npm cache clean --force

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]
