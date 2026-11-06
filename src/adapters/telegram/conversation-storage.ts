import {
	type ConversationData,
	type ConversationStorage as GrammyConversationStorage,
	type VersionedState,
} from '@grammyjs/conversations';
import { RedisAdapter } from '@grammyjs/storage-redis';
import { Context as EffectContext, Effect, Layer } from 'effect';
import { Redis } from 'ioredis';

import { Env } from '../../common/env.js';
import type { Context } from '../../common/types/context.js';

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
		const client = yield* Effect.acquireRelease(
			Effect.sync(() => new Redis(Env.REDIS_URL)),
			(client) => Effect.promise(() => client.quit()),
		);

		const storage = {
			type: 'key',
			prefix: 'conversation:v1:',
			version: conversationStorageVersion,
			adapter: new RedisAdapter<VersionedState<ConversationData>>({
				instance: client,
			}),
		} satisfies ConversationStorage;

		return ConversationPersistence.of({ storage });
	}),
);
