import {
	type ConversationData,
	type ConversationStorage as GrammyConversationStorage,
	type VersionedState,
} from '@grammyjs/conversations';
import { RedisAdapter } from '@grammyjs/storage-redis';
import { Context as EffectContext, Effect, Layer } from 'effect';

import type { Context } from '../../common/types/context.js';
import { Redis } from '../../lib/redis/redis.js';
import { conversationStorageVersion } from './conversation-storage-version.js';

export { conversationStorageVersion } from './conversation-storage-version.js';

export type ConversationStorage = GrammyConversationStorage<
	Context,
	ConversationData
>;

type ConversationPersistenceService = {
	readonly storage: ConversationStorage;
	readonly checkHealth: Effect.Effect<void, unknown>;
};

export const ConversationPersistence =
	EffectContext.Service<ConversationPersistenceService>(
		'app/ConversationPersistence',
	);

export type ConversationPersistence = typeof ConversationPersistence.Identifier;

export const ConversationPersistenceLive = Layer.effect(
	ConversationPersistence,
	Effect.gen(function* () {
		const redis = yield* Redis;

		const storage = {
			type: 'key',
			prefix: 'conversation:v1:',
			version: conversationStorageVersion,
			adapter: new RedisAdapter<VersionedState<ConversationData>>({
				instance: redis.client,
			}),
		} satisfies ConversationStorage;

		const checkHealth = Effect.tryPromise(() => redis.client.ping()).pipe(
			Effect.asVoid,
			Effect.withSpan('conversation-storage.health', {
				attributes: {
					'conversation.storage.version': conversationStorageVersion,
				},
			}),
		);

		return ConversationPersistence.of({ storage, checkHealth });
	}),
);
