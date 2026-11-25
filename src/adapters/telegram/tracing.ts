import { createConversation } from '@grammyjs/conversations';
import { Effect, Option, type Tracer } from 'effect';
import type { NextFunction } from 'grammy';

import type {
	Context,
	ConversationContext,
	ConversationFn,
} from '../../common/types/context.js';

/** Restores the Telegram parent when a callback starts a new Effect fiber. */
export const withTelegramSpan =
	(ctx: Pick<Context, 'span'>) =>
	<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
		const parent = ctx.span;
		const inherited = parent ? Effect.withParentSpan(effect, parent) : effect;
		const conversationId = parent?.attributes.get('conversation.id');
		return typeof conversationId === 'string'
			? inherited.pipe(
					Effect.annotateSpans({ 'conversation.id': conversationId }),
					Effect.annotateLogs({ 'conversation.id': conversationId }),
				)
			: inherited;
	};

export const createTracedConversation = (
	builder: ConversationFn,
	name: string,
) =>
	createConversation<Context, ConversationContext>(
		async (conversation, ctx) => {
			// Replay restores the starting update, so this ID survives restarts
			// without adding external calls or changing persisted replay positions.
			const conversationId = `telegram:${ctx.me.id}:${name}:${ctx.update.update_id}`;
			let span: Tracer.AnySpan | undefined = ctx.span;
			while (span?._tag === 'Span') {
				span.attribute('conversation.id', conversationId);
				span = Option.getOrUndefined(span.parent);
			}
			return builder(conversation, ctx);
		},
		name,
	);

/** Hands the current middleware span to downstream Promise callbacks. */
export const nextWithSpan = (ctx: Context, next: NextFunction) =>
	Effect.gen(function* () {
		const previous = ctx.span;
		return yield* Effect.acquireUseRelease(
			Effect.currentSpan,
			(span) => {
				ctx.span = span;
				return Effect.promise(next);
			},
			() =>
				Effect.sync(() => {
					ctx.span = previous;
				}),
		);
	});
