#!/bin/bash

# Deploy script
echo "🚀 Deploying application..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Build Docker image
echo "🐳 Building Docker image..."
docker build -t new-tes:latest .

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down

# Start new containers
echo "🚀 Starting new containers..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if application is running
echo "🔍 Checking application health..."
if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ Application deployed successfully!"
    echo "🌐 Application is running at: http://localhost:3000"
    echo "📚 API documentation: http://localhost:3000/api/docs"
else
    echo "❌ Application health check failed!"
    echo "📋 Checking logs..."
    docker-compose -f docker-compose.prod.yml logs app
    exit 1
fi
