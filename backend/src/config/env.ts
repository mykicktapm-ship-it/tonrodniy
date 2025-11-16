import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z
      .string()
      .default('4000')
      .transform((value) => {
        const parsed = Number(value);
        if (Number.isNaN(parsed) || parsed <= 0) {
          throw new Error('PORT must be a positive number');
        }
        return parsed;
      }),
    CORS_ORIGINS: z.string().optional()
  })
  .transform((values) => ({
    ...values,
    corsOriginList: values.CORS_ORIGINS
      ? values.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
      : []
  }));

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed');
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  corsOrigins: parsed.data.corsOriginList
};
