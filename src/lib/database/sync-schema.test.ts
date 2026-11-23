import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const state = {
		events: [] as string[],
	};

	const reset = () => {
		state.events = [];
	};

	return { reset, state };
});

vi.mock('@libsql/client', () => ({
	createClient: () => ({
		close: () => mocks.state.events.push('close'),
	}),
}));

vi.mock('drizzle-orm/libsql', () => ({
	drizzle: () => ({}),
}));

vi.mock('drizzle-kit/api', () => ({
	pushSQLiteSchema: async () => ({
		hasDataLoss: false,
		warnings: [],
		apply: async () => {
			mocks.state.events.push('apply');
		},
	}),
}));

process.env.BOT_TOKEN = 'test-token';
process.env.DATABASE_URL = 'file:test.db';
process.env.REDIS_URL = 'redis://localhost:6379';

const { syncDatabaseSchema } = await import('./sync-schema.js');

describe('syncDatabaseSchema', () => {
	it('closes its client before startup can proceed', async () => {
		mocks.reset();

		await Effect.runPromise(
			Effect.scoped(syncDatabaseSchema()).pipe(
				Effect.andThen(() =>
					Effect.sync(() => {
						expect(mocks.state.events).toEqual(['apply', 'close']);
					}),
				),
			),
		);
	});
});
