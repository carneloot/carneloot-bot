import { Either, Schema } from 'effect';

const TelegramUsernamesFromString = Schema.transform(
	Schema.String,
	Schema.Array(Schema.String),
	{
		strict: true,
		decode: (usernames) =>
			usernames
				.split(',')
				.map((username) => username.trim().replace(/^@/, '').toLowerCase())
				.filter(Boolean),
		encode: (usernames) => usernames.join(','),
	},
);

const envSchema = Schema.Struct({
	BOT_TOKEN: Schema.Redacted(Schema.String),
	WEBHOOK_URL: Schema.optional(Schema.String),
	COOLIFY_URL: Schema.optional(Schema.String),

	DATABASE_URL: Schema.String,
	DATABASE_AUTH_TOKEN: Schema.optional(Schema.Redacted(Schema.String)),

	DEBUG: Schema.optional(Schema.String),

	RUN_MODE: Schema.optionalWith(Schema.Literal('polling', 'webhook'), {
		default: () => 'polling',
	}),
	PORT: Schema.optionalWith(Schema.NumberFromString, { default: () => 3000 }),

	REDIS_URL: Schema.String,

	TELEGRAM_FORWARD_USERNAMES: Schema.optional(TelegramUsernamesFromString),
	TELEGRAM_OWNER_CHAT_ID: Schema.optional(Schema.NumberFromString),

	SOURCE_COMMIT: Schema.optional(Schema.String),

	// Tracer
	OTLP_URL: Schema.optional(Schema.String),
	OTLP_API_TOKEN: Schema.optional(Schema.Redacted(Schema.String)),
	OTLP_DATASET: Schema.optional(Schema.String),
});

// eslint-disable-next-line n/no-process-env
const parsed = Schema.decodeUnknownEither(envSchema)(process.env, {
	errors: 'all',
});

if (Either.isLeft(parsed)) {
	throw new Error(parsed.left.message);
}

if (
	(parsed.right.TELEGRAM_FORWARD_USERNAMES === undefined) !==
	(parsed.right.TELEGRAM_OWNER_CHAT_ID === undefined)
) {
	throw new Error(
		'TELEGRAM_FORWARD_USERNAMES and TELEGRAM_OWNER_CHAT_ID must be configured together',
	);
}

export const Env = parsed.right;
