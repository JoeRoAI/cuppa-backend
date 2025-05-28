FROM node:20-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies with legacy-peer-deps to resolve conflicts
RUN npm install --legacy-peer-deps

# Install development dependencies for hot reloading
RUN npm install -g ts-node-dev

# Copy the rest of the application
COPY . .

# Expose the API port
EXPOSE 3000

# Command to run the application in development mode
CMD ["npm", "run", "dev"] 