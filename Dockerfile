# skipwait.me API server (Cloudflare Containers compatible)
FROM node:22-slim AS build
WORKDIR /app
RUN npm install -g pnpm@10.4.1
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
# The deploy workflow writes this before building; create it if absent so a local
# `docker build` does not fail on a file that is gitignored. /api/health already
# tolerates a missing or empty value.
RUN [ -f commit-sha.txt ] || : > commit-sha.txt
RUN pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/commit-sha.txt ./commit-sha.txt
# Run unprivileged. The base image already provides a `node` user, and the server
# needs no write access inside the image. Running as root (uid 0) meant any remote
# code execution in the API process owned the container.
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
