import { Data, Effect } from 'effect';

import type { Command } from '../common/types/command.js';
import { runtime } from '../runtime.js';

const formatMessage = (message: string) =>
	encodeURIComponent(message).replace(/!/g, '%21');

const phoneRegex =
	/^((?:(?:\+|00)?55\s?)?\(?[1-9][0-9]\)?\s?(?:9\d|[2-9])\d{3}[-\s]?\d{4})(?:\s(.*))?/;

class ParsePhoneNumberError extends Data.TaggedError('ParsePhoneNumberError') {}

export const WhatsCommand: Command<'whats'> = {
	command: 'whats',
	description:
		'Gera um link para mandar mensagem no WhatsApp sem precisar adicionar o contato',
	middleware: () => (ctx) =>
		Effect.gen(function* () {
			if (!ctx.match) {
				return yield* new ParsePhoneNumberError();
			}

			const [, rawNumber, message] =
				ctx.match.toString().match(phoneRegex) ?? [];

			if (!rawNumber) {
				return yield* new ParsePhoneNumberError();
			}

			let number = rawNumber.replace(/[^0-9]/g, '');

			if (!number.startsWith('55')) {
				number = `55${number}`;
			}

			const whatsUrl = ['https://wa.me/', number];

			if (message) {
				whatsUrl.push(`?text=${formatMessage(message)}`);
			}

			yield* Effect.tryPromise(() => ctx.reply(whatsUrl.join(''))).pipe(
				Effect.withSpan('ctx.reply')
			);
		}).pipe(
			Effect.catchTag('ParsePhoneNumberError', () =>
				Effect.tryPromise(() =>
					ctx.reply(
						'Envie uma mensagem no formato (00) 0 0000-0000 [mensagem]. A mensagem, os espaços e os algarismos não numéricos são opcionais'
					)
				).pipe(Effect.withSpan('ctx.reply'))
			),
			Effect.withSpan('WhatsCommand'),
			runtime.runPromise
		)
};
