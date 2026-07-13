# Trovarcis Reach worker - Node 22 slim base, production deps only, runs as non-root.
# Small image (~350MB), fast build (~60s). Coolify build pack: Dockerfile.

FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# argon2 uses node-gyp for native compilation. Install build deps, compile, then purge to keep image lean.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first so this npm ci layer caches when only source changes.
COPY package.json package-lock.json* ./

# Runtime deps only. Skips @react-router/dev, vite, node-pg-migrate, dotenv-cli.
RUN npm ci --omit=dev --no-audit --no-fund

# Build tools no longer needed once argon2 is compiled. Removing shrinks the final image.
RUN apt-get purge -y python3 make g++ \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy application source. .dockerignore excludes .env, .git, node_modules, build/, etc.
COPY . .

# Worker health server (Coolify probes this for container health).
EXPOSE 3001

# Drop root privileges. node:22-slim ships with a "node" user (uid 1000).
USER node

CMD ["node", "worker/index.js"]
