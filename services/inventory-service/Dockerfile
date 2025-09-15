# Use Node 20 LTS
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Install nodemon globally for development
RUN npm install -g nodemon

# Copy source code
COPY . .

# Expose default port
EXPOSE 8007

# Command to start service in dev mode
CMD ["nodemon", "./src/index.js"]
