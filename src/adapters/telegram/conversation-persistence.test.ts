import {
	conversations,
	createConversation,
	type ConversationData,
	type ConversationFlavor,
	type VersionedState,
} from '@grammyjs/conversations';
import { sequentialize } from '@grammyjs/runner';
import { Bot, type Context } from 'grammy';
import type { Update, UserFromGetMe } from 'grammy/types';
import { describe, expect, it } from 'vitest';

type TestContext = ConversationFlavor<Context>;

const botInfo = {
	id: 1,
	is_bot: true,
	first_name: 'Test bot',
	username: 'test_bot',
	can_join_groups: true,
	can_read_all_group_messages: false,
	supports_inline_queries: false,
	can_connect_to_business: false,
	has_main_web_app: false,
	has_topics_enabled: false,
	allows_users_to_create_topics: false,
	can_manage_bots: false,
	supports_join_request_queries: false,
} satisfies UserFromGetMe;

const messageUpdate = (chatId: number, messageId: number, text: string) =>
	({
		update_id: messageId,
		message: {
			message_id: messageId,
			date: 0,
			chat: {
				id: chatId,
				type: 'private',
				first_name: 'Test',
			},
			from: {
				id: chatId,
				is_bot: false,
				first_name: 'Test',
			},
			text,
		},
	}) satisfies Update;

const deferred = <Value>() => {
	let resolve: (value: Value) => void = () => undefined;
	const promise = new Promise<Value>((next) => {
		resolve = next;
	});

	return { promise, resolve };
};

describe('conversation persistence', () => {
	it('processes updates from one chat in order', async () => {
		const events: string[] = [];
		const firstStarted = deferred<void>();
		const releaseFirst = deferred<void>();
		const bot = new Bot<Context>('test-token');
		bot.botInfo = botInfo;

		bot.use(sequentialize((ctx) => ctx.chat?.id.toString()));
		bot.on('message:text', async (ctx) => {
			events.push(`start:${ctx.message.message_id}`);
			if (ctx.message.message_id === 1) {
				firstStarted.resolve();
				await releaseFirst.promise;
			}
			events.push(`end:${ctx.message.message_id}`);
		});

		const first = bot.handleUpdate(messageUpdate(1, 1, 'first'));
		await firstStarted.promise;
		const second = bot.handleUpdate(messageUpdate(1, 2, 'second'));

		await Promise.resolve();
		expect(events).toEqual(['start:1']);

		releaseFirst.resolve();
		await Promise.all([first, second]);

		expect(events).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
	});

	it('allows updates from different chats to run concurrently', async () => {
		const events: string[] = [];
		const bothStarted = deferred<void>();
		const release = deferred<void>();
		const bot = new Bot<Context>('test-token');
		bot.botInfo = botInfo;

		bot.use(sequentialize((ctx) => ctx.chat?.id.toString()));
		bot.on('message:text', async (ctx) => {
			events.push(`start:${ctx.chat.id}`);
			if (events.length === 2) {
				bothStarted.resolve();
			}
			await release.promise;
			events.push(`end:${ctx.chat.id}`);
		});

		const first = bot.handleUpdate(messageUpdate(1, 1, 'first'));
		const second = bot.handleUpdate(messageUpdate(2, 2, 'second'));

		await bothStarted.promise;
		expect(events).toEqual(['start:1', 'start:2']);

		release.resolve();
		await Promise.all([first, second]);

		expect(events).toEqual(['start:1', 'start:2', 'end:1', 'end:2']);
	});

	it('resumes persisted conversations and discards incompatible versions', async () => {
		const values = new Map<string, VersionedState<ConversationData>>();
		const adapter = {
			read: (key: string) => Promise.resolve(values.get(key)),
			write: (key: string, value: VersionedState<ConversationData>) => {
				values.set(key, value);
				return Promise.resolve();
			},
			delete: (key: string) => {
				values.delete(key);
				return Promise.resolve();
			},
		};
		const events: string[] = [];
		const createBot = (version: number) => {
			const bot = new Bot<TestContext>('test-token');
			bot.botInfo = botInfo;
			bot.use(sequentialize((ctx) => ctx.chat?.id.toString()));
			bot.use(
				conversations({
					storage: {
						type: 'key',
						prefix: 'conversation:v1:',
						version,
						adapter,
					},
				}),
			);
			bot.use(
				createConversation(async (conversation) => {
					events.push('started');
					const context = await conversation.waitFor('message:text');
					events.push(`received:${context.message.text}`);
				}, 'flow'),
			);
			bot.on('message:text', (ctx) =>
				ctx.message.text === '/begin'
					? ctx.conversation.enter('flow')
					: undefined,
			);

			return bot;
		};

		await createBot(1).handleUpdate(messageUpdate(17, 1, '/begin'));
		expect(events).toEqual(['started']);

		await createBot(1).handleUpdate(messageUpdate(17, 2, 'next'));
		expect(events).toEqual(['started', 'started', 'received:next']);

		events.length = 0;
		await createBot(2).handleUpdate(messageUpdate(17, 3, '/begin'));

		expect(events).toEqual(['started']);
		expect(values.get('conversation:v1:17')?.version).toEqual([0, 2]);
	});
});
