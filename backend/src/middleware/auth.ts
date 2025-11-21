import { createHash, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env';

export type AuthUser = {
  id: string;
  role?: string;
  tokenType: 'service' | 'user';
};

const unauthorized = (res: Response, message: string) => res.status(401).json({ error: message });

const extractBearerToken = (req: Request): string | undefined => {
  const header = req.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) {
    return undefined;
  }
  return header.slice('bearer '.length);
};

export const requireServiceToken = (req: Request, res: Response, next: NextFunction) => {
  const provided = extractBearerToken(req) ?? req.get('x-api-key');
  if (!provided) {
    return unauthorized(res, 'service token is required');
  }
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(env.serviceApiToken))) {
    return unauthorized(res, 'invalid service token');
  }
  res.locals.authUser = { id: 'service', role: 'admin', tokenType: 'service' } satisfies AuthUser;
  return next();
};

export const requireUserToken = (req: Request, res: Response, next: NextFunction) => {
  const token = extractBearerToken(req);
  if (!token) {
    return unauthorized(res, 'user token is required');
  }
  try {
    const [userId, signature] = token.split('.');
    if (!userId || !signature) {
      return unauthorized(res, 'malformed user token');
    }
    const digest = createHash('sha256').update(userId).update(env.jwtSecret).digest('hex');
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
      return unauthorized(res, 'invalid user token');
    }
    res.locals.authUser = { id: userId, role: 'user', tokenType: 'user' } satisfies AuthUser;
    return next();
  } catch (error) {
    return unauthorized(res, (error as Error).message);
  }
};
