# Backend Dockerfile – AWS App Runner compatible (multi-stage)

FROM node:18-alpine AS build

WORKDIR /app

# Install full deps (includes TypeScript) for build
COPY package*.json ./
RUN npm ci

# Copy source & build
COPY . .
RUN npm run build


FROM node:18-alpine AS runtime

WORKDIR /app

# Install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src

# Create necessary directories
RUN mkdir -p logs storage/uploads

# App Runner injects $PORT; default to 5000 for local dev
EXPOSE 5000

# Start server – uses BACKEND_PORT env var which server.ts reads
CMD ["sh", "-c", "BACKEND_PORT=${PORT:-5000} node dist/server.js"]
