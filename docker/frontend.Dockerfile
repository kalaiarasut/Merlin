# Frontend Dockerfile
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Vite env vars are baked in at build time
ARG VITE_API_URL
ARG VITE_AI_SERVICE_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_AI_SERVICE_URL=${VITE_AI_SERVICE_URL}

# Build application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
