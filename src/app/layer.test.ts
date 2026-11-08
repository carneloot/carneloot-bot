import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const createClient = vi.fn(() => ({
		close: vi.fn(),
		execute: async () => undefined,
	}));

	return { createClient };
});

vi.mock('@libsql/client', () => ({
	LibsqlError: class LibsqlError extends Error {},
	createClient: mocks.createClient,
}));

vi.mock('drizzle-orm/libsql', () => ({
	drizzle: () => ({}),
}));

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

const { NotificationSender } =
	await import('../adapters/telegram/notification-sender.js');
const { Database, layer: databaseLayer } =
	await import('../lib/database/db.js');
const { NotificationRepository } =
	await import('../lib/repositories/notification.js');
const { UserRepository } = await import('../lib/repositories/user.js');
const { NotificationService } = await import('../lib/services/notification.js');

describe('application layer ownership', () => {
	it('shares and closes one database client for dependent services', async () => {
		mocks.createClient.mockClear();

		const persistence = Layer.mergeAll(
			NotificationRepository.layer,
			UserRepository.layer,
		).pipe(Layer.provideMerge(databaseLayer));
		const services = NotificationService.layer.pipe(
			Layer.provideMerge(
				Layer.mergeAll(
					persistence,
					Layer.succeed(
						NotificationSender,
						NotificationSender.of({
							sendMessage: () => Effect.die('not used'),
						}),
					),
				),
			),
		);

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					yield* Database;
					yield* NotificationRepository;
					yield* UserRepository;
					yield* NotificationService;
				}).pipe(Effect.provide(services)),
			),
		);

		expect(mocks.createClient).toHaveBeenCalledOnce();
		expect(
			mocks.createClient.mock.results[0]?.value.close,
		).toHaveBeenCalledOnce();
	});
});
