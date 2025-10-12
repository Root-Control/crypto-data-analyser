import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { winstonConfig } from './config/winston.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: winstonConfig,
  });

  const configService = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix('api');

  // Serve static files
  app.useStaticAssets(join(__dirname, '..', 'public'));

  // Security middleware
  app.use(helmet());
  app.use(compression());

  // CORS
  app.enableCors({
    origin: configService.get('cors.origin'),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle(configService.get('swagger.title'))
    .setDescription(configService.get('swagger.description'))
    .setVersion(configService.get('swagger.version'))
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(configService.get('swagger.path'), app, document);

  const port = configService.get('port');
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`🌐 Network access: http://192.168.18.3:${port}`);
  console.log(
    `📚 Swagger documentation: http://localhost:${port}/api/${configService.get('swagger.path')}`,
  );
  console.log(`🔧 Environment: ${configService.get('NODE_ENV')}`);
}

bootstrap();
