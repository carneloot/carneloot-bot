import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

import { NotificationSender } from '../../adapters/telegram/notification-sender.js';
import type { NotificationID } from '../database/schema.js';
import { NotificationRepository } from '../repositories/notification.js';
import { type User, UserRepository } from '../repositories/user.js';
import { makeNotificationService } from './notification.js';

const owner = {
	id: 'owner-id' as User['id'],
	telegramID: 'owner-telegram-id',
	firstName: 'Owner',
	lastName: null,
	username: null,
} satisfies User;

const recipient = {
	...owner,
	id: 'recipient-id' as User['id'],
	telegramID: 'recipient-telegram-id',
} satisfies User;

const createServiceLayer = (
	sendMessage: (
		telegramID: string,
		message: string,
	) => Effect.Effect<{ readonly messageID: number }, unknown>,
	createNotificationHistory = vi.fn(() => Effect.void),
) =>
	Layer.mergeAll(
		Layer.succeed(NotificationSender, NotificationSender.of({ sendMessage })),
		Layer.succeed(
			UserRepository,
			UserRepository.of({
				createUser: () => Effect.die('not used'),
				getUserByTelegramID: () => Effect.die('not used'),
				getUserByID: () => Effect.die('not used'),
				getUserByUsername: () => Effect.die('not used'),
				userHasApiKey: () => Effect.die('not used'),
				generateApiKeyForUser: () => Effect.die('not used'),
				getUserFromApiKey: () => Effect.succeed(owner),
			}),
		),
		Layer.succeed(
			NotificationRepository,
			NotificationRepository.of({
				getNotificationByOwnerAndKeyword: () =>
					Effect.succeed({
						notification: {
							id: 'notification-id' as NotificationID,
							keyword: 'test',
							message: 'test message',
							ownerID: owner.id,
						},
						usersToNotify: [recipient],
					}),
				getNotificationFromHistory: () => Effect.die('not used'),
				createNotificationHistory,
			}),
		),
	);

describe('NotificationService', () => {
	it('fails when every delivery fails after attempting every recipient', async () => {
		const sendMessage = vi.fn(() =>
			Effect.fail(new Error('Telegram unavailable')),
		);
		const createNotificationHistory = vi.fn(() => Effect.void);

		const result = await Effect.runPromise(
			Effect.exit(
				Effect.gen(function* () {
					const service = yield* makeNotificationService;
					return yield* service.sendNotification({
						apiKey: 'api-key',
						keyword: 'test',
						variables: undefined,
					});
				}).pipe(
					Effect.provide(
						createServiceLayer(sendMessage, createNotificationHistory),
					),
				),
			),
		);

		expect(result._tag).toBe('Failure');
		expect(sendMessage).toHaveBeenCalledTimes(2);
		expect(createNotificationHistory).not.toHaveBeenCalled();
	});

	it('reports partial delivery while preserving successful sends and history', async () => {
		const sendMessage = vi.fn((telegramID: string) =>
			telegramID === recipient.telegramID
				? Effect.fail(new Error('Telegram unavailable'))
				: Effect.succeed({ messageID: 1 }),
		);
		const createNotificationHistory = vi.fn(() => Effect.void);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const service = yield* makeNotificationService;
				return yield* service.sendNotification({
					apiKey: 'api-key',
					keyword: 'test',
					variables: undefined,
				});
			}).pipe(
				Effect.provide(
					createServiceLayer(sendMessage, createNotificationHistory),
				),
			),
		);

		expect(result).toEqual({ delivered: 1, failed: 1 });
		expect(sendMessage).toHaveBeenCalledTimes(2);
		expect(createNotificationHistory).toHaveBeenCalledOnce();
	});
});
