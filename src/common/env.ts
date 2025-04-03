import { Either, Schema } from 'effect';

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
	PORT: Schema.optionalWith(Schema.NumberFromString, { default: () => 3000 }),

	REDIS_URL: Schema.String,

	SOURCE_COMMIT: Schema.optional(Schema.String),

	// Tracer
	OTLP_URL: Schema.optional(Schema.String),
	OTLP_API_TOKEN: Schema.optional(Schema.Redacted(Schema.String)),
	OTLP_DATASET: Schema.optional(Schema.String)
});

// eslint-disable-next-line n/no-process-env
const parsed = Schema.decodeUnknownEither(envSchema)(process.env, {
	errors: 'all'
});

if (Either.isLeft(parsed)) {
	throw new Error(parsed.left.message);
}

export const Env = parsed.right;
