# Trovarcis web app: builds the React Router app, then runs migrations and starts the server.

FROM node:22-slim AS build
WORKDIR /app

# argon2 compiles natively during npm ci.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

# Full node_modules on purpose: migrations need node-pg-migrate, a dev dependency.
COPY --from=build --chown=node:node /app /app

USER node
EXPOSE 3000

# exec hands PID 1 to the server so Coolify's stop signal reaches it.
CMD ["sh", "-c", "node_modules/.bin/node-pg-migrate up -m migrations && exec node_modules/.bin/react-router-serve ./build/server/index.js"]
