# syntax=docker/dockerfile:1

# 1) Install production server dependencies
FROM node:20-alpine AS server-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# 2) Runtime image — API / data / MCP service (no bundled web client)
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY lib ./lib
COPY data ./data
EXPOSE 8080
USER node
CMD ["node", "server.js"]
