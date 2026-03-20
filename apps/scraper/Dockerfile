FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/scraper/package.json apps/scraper/package.json
COPY packages/db/package.json packages/db/package.json
# Web package.json needed for workspace resolution
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/scraper/ apps/scraper/
COPY packages/db/ packages/db/

ENV NODE_ENV=production

CMD ["node", "--import", "tsx", "apps/scraper/src/index.ts"]
