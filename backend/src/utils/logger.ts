import pino from 'pino';
import { env } from '../config/env';

const baseLogger = pino({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  base: { service: 'tonrody-backend' }
});

export const getLogger = (bindings?: pino.Bindings) => baseLogger.child(bindings ?? {});

export const logger = getLogger();
