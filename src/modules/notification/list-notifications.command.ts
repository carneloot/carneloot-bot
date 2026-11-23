import { Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';
import type { MessageEntity } from 'grammy/types';

import type { Context } from '../../common/types/context.js';
import { NotificationRepository } from '../../lib/repositories/notification.js';
import { runtime } from '../../runtime.js';

export const ListNotificationsCommand = (async (ctx) => {
	const user = ctx.user;
	if (!user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	const notifications = await runtime.runPromise(
		Effect.gen(function* () {
			const repository = yield* NotificationRepository;
			return yield* repository.getNotificationsByOwner(user.id);
		}),
	);
	if (notifications.length === 0) {
		await ctx.reply(
			'Você não tem notificações cadastradas. Use /criar_notificacao para criar uma.',
		);
		return;
	}

	let text = `Suas notificações (${notifications.length})`;
	const entities: MessageEntity[] = [
		{ type: 'bold', offset: 0, length: text.length },
	];
	for (const notification of notifications) {
		text += '\n\n';
		entities.push({
			type: 'code',
			offset: text.length,
			length: notification.keyword.length,
		});
		text += `${notification.keyword}\n`;
		entities.push({
			type: 'pre',
			offset: text.length,
			length: notification.message.length,
		});
		text += notification.message;
	}

	for (let start = 0; start < text.length; ) {
		let end = Math.min(start + 4096, text.length);
		if (end < text.length) {
			// Prefer keeping each notification together when it fits in a message.
			const boundary = entities
				.filter(
					(entity) =>
						entity.type === 'code' &&
						entity.offset > start &&
						entity.offset <= end,
				)
				.at(-1)?.offset;
			if (boundary !== undefined) end = boundary;
			// Telegram entity offsets use UTF-16; never split an emoji's surrogate pair.
			if (/[\uD800-\uDBFF]/u.test(text.charAt(end - 1))) end--;
		}
		await ctx.reply(text.slice(start, end), {
			entities: entities
				.filter(
					(entity) =>
						entity.offset < end && entity.offset + entity.length > start,
				)
				.map((entity) => ({
					...entity,
					offset: Math.max(entity.offset, start) - start,
					length:
						Math.min(entity.offset + entity.length, end) -
						Math.max(entity.offset, start),
				})),
			link_preview_options: { is_disabled: true },
		});
		start = end;
	}
}) satisfies MiddlewareFn<Context>;
