/**
 * @file src/main.ts
 * @module app
 * @description Application bootstrap with global pipes, filters, and security middlewares
 * @author BharatERP
 * @created 2025-09-18
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppLoggerService } from './shared/logger';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
// Socket.IO Redis adapter will be required dynamically to avoid TS type issues in environments without types

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(AppLoggerService);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter(logger));
  app.useGlobalInterceptors(new LoggingInterceptor(logger));
  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });
  app.use(cookieParser());

  // Swagger API docs
  const swaggerEnabled = (process.env.SWAGGER_ENABLED || 'true') === 'true';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Obsidian API')
      .setDescription('REST API for Auth, RBAC, Market, Accounts, OMS')
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
      .addApiKey({ type: 'apiKey', name: 'x-tenant-id', in: 'header' }, 'Tenant')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  // Socket.IO Redis adapter for horizontal scaling
  try {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const { IoAdapter } = await import('@nestjs/platform-socket.io');
      const { createAdapter } = await import('@socket.io/redis-adapter');
      const { createClient } = await import('redis');
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();
      await pubClient.connect();
      await subClient.connect();
      class RedisIoAdapter extends IoAdapter {
        override createIOServer(port: number, options?: any): any {
          const server = super.createIOServer(port, options);
          server.adapter(createAdapter(pubClient, subClient));
          return server;
        }
      }
      app.useWebSocketAdapter(new RedisIoAdapter());
      logger.debug('Socket.IO Redis adapter enabled');
    } else {
      logger.warn('REDIS_URL not set; Socket.IO adapter not enabled');
    }
  } catch (e) {
    logger.warn('Failed to initialize Socket.IO Redis adapter');
  }

  // Dev-only schema guard: widen users.password_hash to 255 to fit argon2 PHC strings
  try {
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      const dataSource = app.get(DataSource);
      await dataSource.query(
        `ALTER TABLE IF EXISTS users ALTER COLUMN password_hash TYPE varchar(255)`,
      );
    }
  } catch (e) {
    // ignore if fails; synchronize may already handle it
  }
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
