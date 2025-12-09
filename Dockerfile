FROM node:20-alpine AS builder

WORKDIR /app

# Socket URL for the server (passed at build time)
ARG SOCKET_URL
ENV SOCKET_URL=${SOCKET_URL}

COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

COPY . .

# Build the client with the socket URL
RUN npm run build-production

# Production stage - serve static files with nginx
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config for SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
