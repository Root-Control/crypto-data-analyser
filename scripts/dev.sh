#!/bin/bash

# Start development environment
echo "🚀 Starting development environment..."

# Start MongoDB and Redis
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 5

# Start the application
echo "🎯 Starting NestJS application..."
npm run start:dev
