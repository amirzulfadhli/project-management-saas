import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { environment } from './config/environment';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();

  app.enableCors({
    origin: environment.frontendUrl,
    credentials: true,
  });

  await app.listen(environment.port, '0.0.0.0');

  console.log(`FlowPlan API listening on port ${environment.port}`);
}
void bootstrap();
