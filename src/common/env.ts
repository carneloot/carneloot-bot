import { Effect, Result, Schema, SchemaGetter } from 'effect';

const TelegramUsernamesFromString = Schema.String.pipe(
	Schema.decodeTo(Schema.Array(Schema.String), {
		decode: SchemaGetter.transform((usernames) =>
			usernames
				.split(',')
				.map((username) => username.trim().replace(/^@/, '').toLowerCase())
				.filter(Boolean),
		),
		encode: SchemaGetter.transform((usernames) => usernames.join(',')),
	}),
);

const envSchema = Schema.Struct({
	BOT_TOKEN: Schema.RedactedFromValue(Schema.String),
	WEBHOOK_URL: Schema.optional(Schema.String),
	COOLIFY_URL: Schema.optional(Schema.String),

	DATABASE_URL: Schema.String,
	DATABASE_AUTH_TOKEN: Schema.optional(Schema.RedactedFromValue(Schema.String)),

	DEBUG: Schema.optional(Schema.String),

	RUN_MODE: Schema.Literals(['polling', 'webhook']).pipe(
		Schema.withDecodingDefaultType(Effect.succeed('polling')),
	),
	PORT: Schema.NumberFromString.pipe(
		Schema.withDecodingDefaultType(Effect.succeed(3000)),
	),

	REDIS_URL: Schema.String,

	TELEGRAM_FORWARD_USERNAMES: Schema.optional(TelegramUsernamesFromString),
	OWNER_TELEGRAM_ID: Schema.optional(Schema.NumberFromString),

	SOURCE_COMMIT: Schema.optional(Schema.String),

	// Tracer
	OTLP_URL: Schema.optional(Schema.String),
	OTLP_API_TOKEN: Schema.optional(Schema.RedactedFromValue(Schema.String)),
	OTLP_DATASET: Schema.optional(Schema.String),
});

// eslint-disable-next-line n/no-process-env
const parsed = Schema.decodeUnknownResult(envSchema)(process.env, {
	errors: 'all',
});

if (Result.isFailure(parsed)) {
	throw new Error(parsed.failure.message);
}

if (
	parsed.success.TELEGRAM_FORWARD_USERNAMES !== undefined &&
	parsed.success.OWNER_TELEGRAM_ID === undefined
) {
	throw new Error(
		'OWNER_TELEGRAM_ID must be configured when TELEGRAM_FORWARD_USERNAMES is set',
	);
}

export const Env = parsed.success;
