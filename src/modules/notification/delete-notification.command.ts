import { Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';

import type { Context, ConversationFn } from '../../common/types/context.js';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question.js';
import { NotificationRepository } from '../../lib/repositories/notification.js';
import { runtime } from '../../runtime.js';
import { selectNotification } from './select-notification.js';

export const deleteNotificationConversation = (async (cvs, ctx) => {
	const notification = await selectNotification(cvs, ctx);
	if (!notification) return;

	const confirmed = await showYesOrNoQuestion(
		`Deletar a notificação ${notification.keyword}? Seus destinatários e histórico também serão removidos. Chamadas da API com essa palavra-chave deixarão de funcionar.`,
	)(cvs, ctx);
	if (!confirmed) {
		await ctx.reply('Operação cancelada. A notificação foi mantida.');
		return;
	}

	const deleted = await cvs.external(() =>
		runtime.runPromise(
			Effect.gen(function* () {
				const repository = yield* NotificationRepository;
				return yield* repository.deleteNotification(
					notification.ownerID,
					notification.id,
				);
			}),
		),
	);
	await ctx.reply(
		deleted ? 'Notificação deletada!' : 'Essa notificação não existe mais.',
	);
}) satisfies ConversationFn;

export const DeleteNotificationCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}
	await ctx.conversation.enter('deleteNotification');
}) satisfies MiddlewareFn<Context>;
