import { Effect, Redacted } from 'effect';
import { Bot as GrammyBot } from 'grammy';

import { Context } from '../../common/types/context.js';
import { Env } from '../../common/env.js';

export class Bot extends Effect.Service<Bot>()(
	'carneloot-bot/lib/services/bot',
	{
		scoped: Effect.gen(function* () {
			const bot = new GrammyBot<Context>(Env.BOT_TOKEN.pipe(Redacted.value));

			yield* Effect.addFinalizer(() => Effect.promise(() => bot.stop()));

			return bot;
		})
	}
) {}
