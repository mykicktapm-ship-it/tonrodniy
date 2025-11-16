import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.string().default('4000'),
    SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
    TON_WEBHOOK_SECRET: z.string().min(1, 'TON_WEBHOOK_SECRET is required'),
    CORS_ORIGINS: z.string().optional()
  })
  .transform((values) => {
    const port = Number(values.PORT);
    if (Number.isNaN(port) || port <= 0) {
      throw new Error('PORT must be a positive number');
    }

    return {
      ...values,
      PORT: port,
      corsOriginList: values.CORS_ORIGINS
        ? values.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
        : []
    };
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed');
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  corsOrigins: parsed.data.corsOriginList,
  supabaseUrl: parsed.data.SUPABASE_URL,
  supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  jwtSecret: parsed.data.JWT_SECRET,
  telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
  tonWebhookSecret: parsed.data.TON_WEBHOOK_SECRET
};
