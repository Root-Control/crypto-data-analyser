export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    uri: process.env.DATABASE_URI || 'mongodb://localhost:27017/new-tes',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret:
      process.env.JWT_SECRET ||
      'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '3600s',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  swagger: {
    title: process.env.SWAGGER_TITLE || 'New TES API',
    description:
      process.env.SWAGGER_DESCRIPTION ||
      'A comprehensive NestJS boilerplate with MongoDB, Redis, JWT Auth, and Generic CRUD Service',
    version: process.env.SWAGGER_VERSION || '1.0',
    path: process.env.SWAGGER_PATH || 'docs',
  },
});
