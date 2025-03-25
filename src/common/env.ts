import { Schema } from 'effect';

const envSchema = Schema.Struct({
	BOT_TOKEN: Schema.Redacted(Schema.String),
	WEBHOOK_URL: Schema.optional(Schema.String),
	COOLIFY_URL: Schema.optional(Schema.String),

	DATABASE_URL: Schema.String,
	DATABASE_AUTH_TOKEN: Schema.optional(Schema.Redacted(Schema.String)),

	DEBUG: Schema.optional(Schema.String),

	RUN_MODE: Schema.optionalWith(Schema.Literal('polling', 'webhook'), {
		default: () => 'polling'
	}),
	// RUN_MODE: z.enum(['polling', 'webhook']).optional().default('polling'),
	PORT: Schema.optionalWith(Schema.NumberFromString, { default: () => 3000 }),

	REDIS_URL: Schema.String
});

// eslint-disable-next-line n/no-process-env
export const Env = Schema.decodeUnknownSync(envSchema)(process.env);
