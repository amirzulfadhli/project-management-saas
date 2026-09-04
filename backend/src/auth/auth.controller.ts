import { Controller, All, Req, Res } from '@nestjs/common';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { auth } from './auth';

@Controller('api/auth')
export class AuthController {
  // Forward every /api/auth/* request to Better Auth's request handler. Better
  // Auth owns its route table (sign-up/email, sign-in/email, sign-out,
  // get-session, OAuth, …), so we proxy the whole namespace rather than
  // re-declaring each endpoint here.
  @All('{*path}')
  async handle(
    @Req() req: ExpressRequest,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const response = await auth.handler(this.convertToNativeRequest(req));

    // Preserve cookies (potentially multiple set-cookie headers) separately,
    // since the Fetch Headers API collapses them into a single comma-joined
    // value via forEach().
    const setCookies = response.headers.getSetCookie();
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') return;
      res.setHeader(key, value);
    });
    if (setCookies.length > 0) {
      res.setHeader('set-cookie', setCookies);
    }

    res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
  }

  private convertToNativeRequest(req: ExpressRequest): Request {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (key.toLowerCase() === 'content-length') continue;
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else {
        headers.set(key, String(value));
      }
    }

    // NestJS's global body parser has already consumed the raw stream and
    // populated `req.body`, so forward the parsed body rather than the spent
    // stream.
    let body: BodyInit | undefined;
    if (
      req.method !== 'GET' &&
      req.method !== 'HEAD' &&
      req.body !== undefined
    ) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    return new Request(url, {
      method: req.method,
      headers,
      body,
    });
  }
}
