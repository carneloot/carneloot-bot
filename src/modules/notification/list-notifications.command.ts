import { Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';

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

	await ctx.reply(
		'Suas notificações, com a palavra-chave seguida da mensagem:',
	);
	for (const notification of notifications) {
		await ctx.reply(notification.keyword);
		await ctx.reply(notification.message);
	}
}) satisfies MiddlewareFn<Context>;
