# Multi-stage build for production
# Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev && npm cache clean --force

# Production stage
FROM node:20-alpine AS production

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S appuser -u 1001

# Set working directory
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=appuser:nodejs . .

# Set environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Expose port
EXPOSE 9001

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:9001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "src/index.js"]