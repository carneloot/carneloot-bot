import { createConversation } from '@grammyjs/conversations';
import {
	context,
	SpanKind,
	SpanStatusCode,
	trace,
	type Tracer as OtelTracer,
} from '@opentelemetry/api';
import { Effect, Option, type Tracer } from 'effect';
import type { NextFunction, Transformer } from 'grammy';

import type {
	Context,
	ConversationContext,
	ConversationFn,
} from '../../common/types/context.js';

export const createTelegramApiTracing =
	(tracer: OtelTracer): Transformer =>
	async (prev, method, payload, signal) => {
		if (method === 'getUpdates') return prev(method, payload, signal);

		const span = tracer.startSpan(`telegram.api.${method}`, {
			kind: SpanKind.CLIENT,
			attributes: {
				'telegram.api.method': method,
				...('chat_id' in payload
					? { 'telegram.chat.id': payload.chat_id }
					: {}),
			},
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const response = await prev(method, payload, signal);
				if (!response.ok) {
					span.setAttribute('telegram.error.code', response.error_code);
					span.setStatus({ code: SpanStatusCode.ERROR });
				}
				return response;
			} catch (error) {
				// Errors and URLs can contain bot tokens or message content.
				span.setStatus({ code: SpanStatusCode.ERROR });
				throw error;
			} finally {
				span.end();
			}
		});
	};

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
