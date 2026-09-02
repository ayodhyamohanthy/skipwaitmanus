# skipwait.me API server (Cloudflare Containers compatible)
FROM node:22-slim AS build
WORKDIR /app
RUN npm install -g pnpm@10.4.1
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle
COPY commit-sha.txt ./commit-sha.txt
EXPOSE 3000
CMD ["node", "dist/index.js"]
