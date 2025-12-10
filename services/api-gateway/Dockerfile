# Use Node 20 LTS
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm install

# Install nodemon globally for live reloading
RUN npm install -g nodemon

# Copy source code
COPY . .

# Set environment variables
ENV NODE_ENV=development

# Expose default port
EXPOSE 8000

# Start the application with nodemon for live reloading
CMD ["nodemon", "./src/index.js"]
