import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
      xssFilter: true,
      noSniff: true,
      frameguard: { action: 'deny' },
    }),
  );

  const corsOrigins =
    process.env.CORS_ORIGIN?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ??
    (process.env.NODE_ENV === 'production'
      ? ['https://app.handyseller.ru', 'https://dev.handyseller.ru']
      : true);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.WMS_PORT ?? process.env.PORT ?? 4200;
  await app.listen(port);
}

bootstrap();
