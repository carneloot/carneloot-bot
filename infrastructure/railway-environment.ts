import { Config, Context, Effect, Layer, Option } from 'effect';
import type * as Redacted from 'effect/Redacted';

type EnvironmentValue = string | Redacted.Redacted<string>;

export class RailwayEnvironment extends Context.Service<
	RailwayEnvironment,
	{ environment: Record<string, EnvironmentValue> }
>()('CarnelootBot/RailwayEnvironment') {
	static readonly layer = Layer.effect(
		RailwayEnvironment,
		Effect.gen(function* () {
			const config = yield* Config.all({
				botToken: Config.Redacted('BOT_TOKEN'),
				runMode: Config.String('RUN_MODE').pipe(Config.withDefault('polling')),
				webhookUrl: Config.option(Config.String('WEBHOOK_URL')),
				debug: Config.option(Config.String('DEBUG')),
				forwardUsernames: Config.option(
					Config.String('TELEGRAM_FORWARD_USERNAMES'),
				),
				ownerTelegramId: Config.option(Config.String('OWNER_TELEGRAM_ID')),
				sourceCommit: Config.option(Config.String('SOURCE_COMMIT')),
				otlpUrl: Config.option(Config.String('OTLP_URL')),
				otlpApiToken: Config.option(Config.Redacted('OTLP_API_TOKEN')),
				otlpDataset: Config.option(Config.String('OTLP_DATASET')),
			});

			const environment: Record<string, EnvironmentValue> = {
				BOT_TOKEN: config.botToken,
				RUN_MODE: config.runMode,
			};

			if (Option.isSome(config.webhookUrl)) {
				environment.WEBHOOK_URL = config.webhookUrl.value;
			}
			if (Option.isSome(config.debug)) {
				environment.DEBUG = config.debug.value;
			}
			if (Option.isSome(config.forwardUsernames)) {
				environment.TELEGRAM_FORWARD_USERNAMES = config.forwardUsernames.value;
			}
			if (Option.isSome(config.ownerTelegramId)) {
				environment.OWNER_TELEGRAM_ID = config.ownerTelegramId.value;
			}
			if (Option.isSome(config.sourceCommit)) {
				environment.SOURCE_COMMIT = config.sourceCommit.value;
			}
			if (Option.isSome(config.otlpUrl)) {
				environment.OTLP_URL = config.otlpUrl.value;
			}
			if (Option.isSome(config.otlpApiToken)) {
				environment.OTLP_API_TOKEN = config.otlpApiToken.value;
			}
			if (Option.isSome(config.otlpDataset)) {
				environment.OTLP_DATASET = config.otlpDataset.value;
			}

			return { environment };
		}),
	);
}
