FROM node:20-alpine

# Create app user
RUN addgroup -g 1001 -S nodejs \
 && adduser -S appuser -u 1001

WORKDIR /app
RUN mkdir -p /app/logs && chown -R 1001:1001 /app/logs

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm install --omit=dev && npm cache clean --force

# Copy source code
COPY src ./src

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"

EXPOSE 8001

USER appuser

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8001/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "src/index.js"]
