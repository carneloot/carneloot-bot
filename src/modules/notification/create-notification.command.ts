import { Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';
import invariant from 'tiny-invariant';

import type { Context, ConversationFn } from '../../common/types/context.js';
import { NotificationRepository } from '../../lib/repositories/notification.js';
import { runtime } from '../../runtime.js';

export const createNotificationConversation = (async (cvs, ctx) => {
	const user = await cvs.external((ctx) => ctx.user);
	invariant(user, 'User is not defined');

	await ctx.reply(
		'Qual a palavra-chave da notificação? Exemplo: backup_concluido. Use /cancelar para cancelar.',
	);

	let keyword: string;
	do {
		keyword = (
			await cvs.form.text((ctx) =>
				ctx.reply('Envie a palavra-chave como texto.'),
			)
		).trim();
		if (!keyword || /\s/u.test(keyword)) {
			await ctx.reply(
				'Envie uma palavra-chave sem espaços. Exemplo: backup_concluido.',
			);
		}
	} while (!keyword || /\s/u.test(keyword));

	await ctx.reply(
		'Qual a mensagem da notificação? Você pode usar variáveis como {{nome}}. Exemplo: Backup de {{nome}} concluído. Envie esses valores no campo variables ao chamar /api/notify.',
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

	const created = await cvs.external(() =>
		runtime.runPromise(
			Effect.gen(function* () {
				const repository = yield* NotificationRepository;
				return yield* repository.createNotification(user.id, keyword, message);
			}),
		),
	);

	await ctx.reply(
		created
			? `Notificação criada! Use a palavra-chave ${keyword} e sua API key em /api/notify. Se precisar de uma chave, use /gerar_chave.`
			: 'Você já tem uma notificação com essa palavra-chave. Nada foi alterado. Use /criar_notificacao com outra palavra-chave.',
	);
}) satisfies ConversationFn;

export const CreateNotificationCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('createNotification');
}) satisfies MiddlewareFn<Context>;
