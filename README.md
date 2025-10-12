# New TES - NestJS Boilerplate

A comprehensive NestJS boilerplate with MongoDB, Redis, JWT Auth, and Generic CRUD Service.

## Features

- 🚀 **NestJS Framework** - Modern, scalable Node.js framework
- 🗄️ **MongoDB** - NoSQL database with Mongoose ODM
- 🔴 **Redis** - In-memory data structure store
- 🔐 **JWT Authentication** - Secure authentication with JWT tokens
- 📝 **Generic CRUD Service** - Reusable CRUD operations with generics
- 📚 **Swagger Documentation** - Auto-generated API documentation
- 🐳 **Docker Support** - Containerized application with Docker Compose
- 🔧 **TypeScript** - Full TypeScript support
- ✅ **Validation** - Request validation with class-validator
- 🎯 **Event Emitter** - Event-driven architecture
- 🛡️ **Security** - Helmet, CORS, and other security middleware

## Project Structure

```
src/
├── common/                 # Shared utilities and base classes
│   ├── decorators/        # Custom decorators
│   ├── dtos/             # Base DTOs and pagination
│   ├── schemas/          # Base MongoDB schemas
│   └── services/         # Generic CRUD service
├── config/               # Configuration files
├── modules/              # Feature modules
│   ├── articles/         # Articles module (example)
│   ├── auth/            # Authentication module
│   └── database/        # Database configuration
├── third-party-services/ # External service integrations
│   └── redis/           # Redis service
├── app.module.ts        # Root module
└── main.ts             # Application entry point
```

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB
- Redis
- Docker (optional)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd new-tes
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp env.example .env
```

4. Start the application:

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

### Docker

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down
```

## API Documentation

Once the application is running, visit:

- **API Documentation**: http://localhost:3000/api/docs
- **Health Check**: http://localhost:3000/api/health

## Generic CRUD Service

The boilerplate includes a powerful generic CRUD service that can be extended by any module:

```typescript
@Injectable()
export class ArticlesService extends CrudService<
  Article,
  Model<ArticleDocument>,
  ArticleDto,
  CreateArticleDto,
  UpdateArticleDto
> {
  constructor(
    @InjectModel(Article.name)
    private readonly articleModel: Model<ArticleDocument>,
  ) {
    super(articleModel);
  }

  protected getDtoClass(): new () => ArticleDto {
    return ArticleDto;
  }
}
```

### Available CRUD Operations

- `create(createDto)` - Create a new document
- `find(filter, pagination)` - Find documents with filtering and pagination
- `findOne(filter)` - Find a single document
- `findById(id)` - Find document by ID
- `updateById(id, updateDto)` - Update document by ID
- `patchById(id, patchDto)` - Partial update by ID
- `deleteById(id)` - Delete document by ID

## Authentication

The application includes JWT-based authentication:

### Register

```bash
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

### Login

```bash
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Protected Routes

Use the `@UseGuards(JwtAuthGuard)` decorator to protect routes.

## Event System

The application includes an event emitter system:

```typescript
// Emit events
this.eventEmitter.emit('user.registered', { userId, email, timestamp });

// Listen to events
@OnEvent('user.registered')
handleUserRegistered(payload: any) {
  console.log('User registered:', payload);
}
```

## Environment Variables

```env
# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URI=mongodb://localhost:27017/new-tes

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=3600s

# CORS
CORS_ORIGIN=*

# Swagger
SWAGGER_TITLE=New TES API
SWAGGER_DESCRIPTION=A comprehensive NestJS boilerplate
SWAGGER_VERSION=1.0
SWAGGER_PATH=docs
```

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## CI/CD

The project includes a GitLab CI pipeline (`.gitlab-ci.yml`) with:

- Build stage
- Test stage
- Docker build
- Deploy stage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

ISC
