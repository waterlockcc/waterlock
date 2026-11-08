# Build context is the repo root (see compose.yaml).
FROM node:26-slim
WORKDIR /app
RUN npm install -g pnpm@10.26.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY examples ./examples
# Shared dir for the session handoff; owned by node so the volume is writable.
RUN mkdir /shared && chown node:node /shared
USER node
