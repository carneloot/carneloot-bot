import type { Conversation } from '@grammyjs/conversations';
import { Effect, Schema } from 'effect';

import type {
	Context,
	ConversationContext,
} from '../../common/types/context.js';
import type { Execute } from '../execute.js';

/** Runs an Effect once and persists its Schema-encoded result for conversation replay. */
export const conversationExternal = <Value, Encoded, Requirements>(
	conversation: Conversation<Context, ConversationContext>,
	execute: Execute<Requirements>,
	schema: Schema.Codec<Value, Encoded>,
	operation: (context: Context) => Effect.Effect<Value, unknown, Requirements>,
) =>
	conversation.external({
		task: (context) => execute(operation(context)),
		beforeStore: Schema.encodePromise(schema),
		afterLoad: Schema.decodePromise(schema),
	});
