import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { env } from './config';

async function bootstrap() {
  console.log('[DIAGNOSTIC] MongoDB URI:', env.MONGO_URI); // by aks for diagnostic purposes only, remove in production

  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
bootstrap();

