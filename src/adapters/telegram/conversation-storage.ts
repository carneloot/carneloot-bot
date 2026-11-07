import {
	type ConversationData,
	type ConversationStorage as GrammyConversationStorage,
	type VersionedState,
} from '@grammyjs/conversations';
import { RedisAdapter } from '@grammyjs/storage-redis';
import { Context as EffectContext, Effect, Layer } from 'effect';

import type { Context } from '../../common/types/context.js';
import { Redis } from '../../lib/redis/redis.js';

export const conversationStorageVersion = 1;

export type ConversationStorage = GrammyConversationStorage<
	Context,
	ConversationData
>;

type ConversationPersistenceService = {
	readonly storage: ConversationStorage;
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

		return ConversationPersistence.of({ storage });
	}),
);
