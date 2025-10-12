# New TES - NestJS Boilerplate Makefile

.PHONY: help install build start dev test test-e2e lint format clean docker-build docker-up docker-down

# Default target
help:
	@echo "Available commands:"
	@echo "  install     - Install dependencies"
	@echo "  build       - Build the application"
	@echo "  start       - Start the application in production mode"
	@echo "  dev         - Start the application in development mode"
	@echo "  test        - Run unit tests"
	@echo "  test-e2e    - Run e2e tests"
	@echo "  lint        - Run ESLint"
	@echo "  format      - Format code with Prettier"
	@echo "  clean       - Clean build artifacts"
	@echo "  docker-build - Build Docker image"
	@echo "  docker-up   - Start Docker containers"
	@echo "  docker-down - Stop Docker containers"

# Install dependencies
install:
	npm install

# Build the application
build:
	npm run build

# Start in production mode
start:
	npm run start:prod

# Start in development mode
dev:
	npm run start:dev

# Run unit tests
test:
	npm run test

# Run e2e tests
test-e2e:
	npm run test:e2e

# Run linting
lint:
	npm run lint

# Format code
format:
	npm run format

# Clean build artifacts
clean:
	rm -rf dist/
	rm -rf coverage/
	rm -rf node_modules/

# Build Docker image
docker-build:
	docker build -t new-tes:latest .

# Start Docker containers
docker-up:
	docker-compose -f docker-compose.dev.yml up -d

# Stop Docker containers
docker-down:
	docker-compose -f docker-compose.dev.yml down

# Start production containers
docker-up-prod:
	docker-compose -f docker-compose.prod.yml up -d

# Stop production containers
docker-down-prod:
	docker-compose -f docker-compose.prod.yml down

# Run development environment
dev-env:
	./scripts/dev.sh

# Deploy to production
deploy:
	./scripts/deploy.sh

# Build for production
build-prod:
	./scripts/build.sh
