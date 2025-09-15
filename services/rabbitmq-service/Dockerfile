# Use lightweight Node.js runtime
FROM node:20-alpine

# Create app directory
WORKDIR /src/app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install 

# Copy app source
COPY . .

# Expose (optional – this service doesn’t expose HTTP but helps for debugging)
EXPOSE 3000

# Run RabbitMQ service
CMD ["nodemon", "src/index.js"]
