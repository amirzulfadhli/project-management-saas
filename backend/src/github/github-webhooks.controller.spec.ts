import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { GithubService } from './github.service';
import { GithubWebhooksController } from './github-webhooks.controller';

jest.mock('../realtime/realtime.service', () => ({
  RealtimeService: class RealtimeService {},
}));

describe('GithubWebhooksController raw body', () => {
  let app: INestApplication<App>;
  const receiveWebhook = jest.fn().mockResolvedValue({
    accepted: true,
    duplicate: false,
    deliveryId: '10000000-0000-4000-8000-000000000001',
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GithubWebhooksController],
      providers: [{ provide: GithubService, useValue: { receiveWebhook } }],
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('passes the exact signed bytes to the webhook service', async () => {
    const deliveryId = '10000000-0000-4000-8000-000000000001';
    const body = '{"repository":{"id":123},"spacing":true}';

    await request(app.getHttpServer())
      .post('/api/github/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-github-delivery', deliveryId)
      .set('x-hub-signature-256', `sha256=${'a'.repeat(64)}`)
      .send(body)
      .expect(202);

    expect(receiveWebhook).toHaveBeenCalledWith(
      'push',
      deliveryId,
      `sha256=${'a'.repeat(64)}`,
      Buffer.from(body),
    );
  });
});
