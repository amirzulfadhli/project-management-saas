import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { auth } from './auth';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  role?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

/**
 * Resolves the current user from the Better Auth session cookie and attaches
 * it to the request as `request.user`, or rejects the request with 401.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const session = await auth.api.getSession({
      headers: this.toHeaders(request.headers),
    });

    if (!session?.user) {
      throw new UnauthorizedException('Authentication required');
    }

    request.user = session.user;
    return true;
  }

  private toHeaders(headers: Request['headers']): Headers {
    const result = new Headers();
    for (const [key, value] of Object.entries(headers ?? {})) {
      if (value === undefined) continue;
      result.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }
    return result;
  }
}
