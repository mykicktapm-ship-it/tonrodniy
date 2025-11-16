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
    TON_NETWORK: z.string().min(1, 'TON_NETWORK is required'),
    TON_RPC_URL: z.string().url('TON_RPC_URL must be a valid URL'),
    TON_API_KEY: z.string().min(1, 'TON_API_KEY is required'),
    TON_CONTRACT_ADDRESS: z.string().min(1, 'TON_CONTRACT_ADDRESS is required'),
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
  tonWebhookSecret: parsed.data.TON_WEBHOOK_SECRET,
  // TON RPC wiring lands in F5, but these values are already used for configuration/logging in F4.
  tonNetwork: parsed.data.TON_NETWORK,
  tonRpcUrl: parsed.data.TON_RPC_URL,
  tonApiKey: parsed.data.TON_API_KEY,
  tonContractAddress: parsed.data.TON_CONTRACT_ADDRESS
};
