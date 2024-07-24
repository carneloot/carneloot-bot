import { z } from 'zod';

const envSchema = z.object({
	BOT_TOKEN: z.string(),
	WEBHOOK_URL: z.string().optional(),
	TRIGGER_API_KEY: z.string(),

	DATABASE_URL: z.string(),
	DATABASE_AUTH_TOKEN: z.string().optional(),

	DEBUG: z.string().optional(),

	RUN_MODE: z.enum(['polling', 'webhook']).optional().default('polling'),
	PORT: z.coerce.number().optional().default(3000)
});

// eslint-disable-next-line n/no-process-env
export const Env = envSchema.parse(process.env);
