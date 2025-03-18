import { Duration, Effect, Option, Predicate, Schema } from 'effect';

import invariant from 'tiny-invariant';

import type { Command } from '../common/types/command.js';

const MAX_DURATION = Duration.decode('10 seconds');

export const PingCommand: Command<'ping'> = {
	command: 'ping',
	description: 'Ponga de volta',
	middleware: () => (ctx) =>
		Effect.gen(function* () {
			const message = ctx.message;

			invariant(message);

			const duration = Option.fromNullable(ctx.match).pipe(
				Option.filter(Predicate.isString),
				Option.andThen(Schema.decodeOption(Schema.NumberFromString)),
				Option.andThen(Duration.millis),
				Option.filter(Duration.lessThanOrEqualTo(MAX_DURATION))
			);

			if (Option.isSome(duration)) {
				yield* Effect.sleep(duration.value);
			}

			const replyMessage = Option.match(duration, {
				onNone: () => 'pong',
				onSome: (v) => `pong ${Duration.format(v)}`
			});

			yield* Effect.tryPromise(() =>
				ctx.reply(replyMessage, {
					reply_parameters: {
						message_id: message.message_id
					}
				})
			);
		}).pipe(Effect.runPromise)
};
