import { Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';

import type { Context, ConversationFn } from '../../common/types/context.js';
import { NotificationRepository } from '../../lib/repositories/notification.js';
import { runtime } from '../../runtime.js';
import { selectNotification } from './select-notification.js';

export const editNotificationConversation = (async (cvs, ctx) => {
	const notification = await selectNotification(cvs, ctx);
	if (!notification) return;

	await ctx.reply('Mensagem atual:');
	await ctx.reply(notification.message);
	await ctx.reply(
		'Envie a nova mensagem. Você pode usar variáveis como {{project}} e {{title}}. A palavra-chave será mantida. Use /cancelar para cancelar.',
	);
	let message: string;
	do {
		message = await cvs.form.text((ctx) =>
			ctx.reply('Envie a mensagem da notificação como texto.'),
		);
		if (!message.trim()) {
			await ctx.reply(
				'A mensagem não pode ficar vazia. Envie o texto da notificação.',
			);
		}
	} while (!message.trim());

	const updated = await cvs.external(() =>
		runtime.runPromise(
			Effect.gen(function* () {
				const repository = yield* NotificationRepository;
				return yield* repository.updateNotification(
					notification.ownerID,
					notification.id,
					message,
				);
			}),
		),
	);
	await ctx.reply(
		updated
			? 'Notificação atualizada! A palavra-chave continua a mesma.'
			: 'Essa notificação não existe mais. Use /listar_notificacoes para ver suas notificações.',
	);
}) satisfies ConversationFn;

export const EditNotificationCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}
	await ctx.conversation.enter('editNotification');
}) satisfies MiddlewareFn<Context>;
