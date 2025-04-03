import { Data } from 'effect';
import { GrammyError } from 'grammy';

export class BotError extends Data.TaggedError('BotError')<{
	cause: GrammyError;
}> {}

export const matchBotError = (cause: unknown) => {
	if (cause instanceof GrammyError) {
		return new BotError({ cause });
	}
	return null;
};
