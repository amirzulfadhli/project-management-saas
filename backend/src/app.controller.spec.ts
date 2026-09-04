import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('AppController', () => {
  let appController: AppController;
  const queryRaw = jest.fn();

  beforeEach(async () => {
    queryRaw.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health endpoints', () => {
    it('reports process liveness without querying the database', () => {
      expect(appController.getHealth()).toEqual({ status: 'ok' });
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('reports readiness after a successful database query', async () => {
      queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      await expect(appController.getReady()).resolves.toEqual({
        status: 'ready',
      });
    });

    it('returns service unavailable when PostgreSQL is unavailable', async () => {
      queryRaw.mockRejectedValueOnce(new Error('connection failed'));
      await expect(appController.getReady()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
