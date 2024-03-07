import { z } from 'zod';

const envSchema = z.object({
	BOT_TOKEN: z.string(),
	TRIGGER_API_KEY: z.string(),

	DATABASE_URL: z.string(),
	DATABASE_AUTH_TOKEN: z.string().optional(),

	WEBHOOK_URL: z.string().url().optional(),

	DEBUG: z.string().optional(),

	VERCEL_URL: z.string().optional(),
	VERCEL_ENV: z.string().optional()
});

// eslint-disable-next-line n/no-process-env
export const Env = envSchema.parse(process.env);
