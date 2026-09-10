import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { GithubService } from './github.service';

@Controller('api/github/webhooks')
export class GithubWebhooksController {
  constructor(private readonly github: GithubService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(
    @Headers('x-github-event') eventName: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ) {
    return this.github.receiveWebhook(
      eventName,
      deliveryId,
      signature,
      request.rawBody,
    );
  }
}
