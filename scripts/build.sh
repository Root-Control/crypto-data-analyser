#!/bin/bash

# Build script for production
echo "🏗️ Building application for production..."

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Build the application
echo "🔨 Building TypeScript..."
npm run build

# Create production package
echo "📦 Creating production package..."
tar -czf new-tes.tar.gz dist/ package.json package-lock.json

echo "✅ Build completed successfully!"
echo "📦 Production package: new-tes.tar.gz"
