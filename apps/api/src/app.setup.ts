import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { env } from './config';

export function configureApp(app: INestApplication) {
  app.use(helmet());
  (app as any).useBodyParser?.('json', { limit: '2mb' });   // sync batches can carry many sales
  app.enableCors({ origin: env.CORS_ORIGINS.split(','), credentials: true });
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
}
