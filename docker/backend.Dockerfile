# Backend Dockerfile

FROM --platform=linux/amd64 node:18-alpine AS builder

WORKDIR /app

# Install deps (include dev deps for TypeScript build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build


FROM --platform=linux/amd64 node:18-alpine AS runtime

WORKDIR /app

# Install prod deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and any runtime assets needed
COPY --from=builder /app/dist ./dist

# Create necessary directories
RUN mkdir -p logs storage/uploads

# Expose port
EXPOSE 5000

# Start server
CMD ["node", "dist/server.js"]
