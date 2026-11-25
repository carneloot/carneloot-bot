import { Effect, Schema } from 'effect';
import type { Middleware, MiddlewareFn } from 'grammy';
import type { MessageEntity } from 'grammy/types';
import invariant from 'tiny-invariant';

import type { AppServices } from '../../../app/layer.js';
import { Module } from '../../../common/module/module.js';
import type { Context, ConversationFn } from '../../../common/types/context.js';
import { showOptionsKeyboard } from '../../../common/utils/show-options-keyboard.js';
import { showYesOrNoQuestion } from '../../../common/utils/show-yes-or-no-question.js';
import type { NotificationID, UserID } from '../../../lib/database/schema.js';
import { NotificationRepository } from '../../../lib/repositories/notification.js';
import type { Execute } from '../../execute.js';
import { conversationExternal } from '../conversation-external.js';
import { createTracedConversation, withTelegramSpan } from '../tracing.js';

const ConversationUser = Schema.Struct({
	id: Schema.String,
	telegramID: Schema.String,
});

const Notification = Schema.Struct({
	id: Schema.String,
	ownerID: Schema.String,
	keyword: Schema.String,
	message: Schema.String,
});

const emptyListMessage =
	'Você não tem notificações cadastradas. Use /criar_notificacao para criar uma.';

const getNotifications = (ownerID: string) =>
	NotificationRepository.pipe(
		Effect.andThen((repository) =>
			repository.getNotificationsByOwner(ownerID as UserID),
		),
	);

export const createNotificationModule = (
	execute: Execute<AppServices>,
	userMiddleware: Middleware<Context>,
): Module<Context> => {
	const module = new Module<Context>('', 'Opções de notificações');

	const getUser = (cvs: Parameters<ConversationFn>[0]) =>
		conversationExternal(cvs, execute, ConversationUser, (context) =>
			Effect.sync(() => {
				invariant(context.user, 'User is not defined');
				return context.user;
			}),
		);

	const selectNotification = (async (cvs, ctx) => {
		const user = await getUser(cvs);
		const notifications = await conversationExternal(
			cvs,
			execute,
			Schema.Array(Notification),
			() => getNotifications(user.id),
		);
		if (notifications.length === 0) {
			await ctx.reply(emptyListMessage);
			return;
		}

		return showOptionsKeyboard({
			values: notifications,
			labelFn: (notification) => notification.keyword,
			message: 'Escolha uma notificação. Use /cancelar para cancelar.',
			addCancel: true,
		})(cvs, ctx);
	}) satisfies ConversationFn;

	const createNotification = (async (cvs, ctx) => {
		const user = await getUser(cvs);
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

		const created = await conversationExternal(
			cvs,
			execute,
			Schema.Boolean,
			() =>
				NotificationRepository.pipe(
					Effect.andThen((repository) =>
						repository.createNotification(user.id as UserID, keyword, message),
					),
				),
		);
		await ctx.reply(
			created
				? `Notificação criada! Use a palavra-chave ${keyword} e sua API key em /api/notify. Se precisar de uma chave, use /gerar_chave.`
				: 'Você já tem uma notificação com essa palavra-chave. Nada foi alterado. Use /criar_notificacao com outra palavra-chave.',
		);
	}) satisfies ConversationFn;

	const editNotification = (async (cvs, ctx) => {
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

		const updated = await conversationExternal(
			cvs,
			execute,
			Schema.Boolean,
			() =>
				NotificationRepository.pipe(
					Effect.andThen((repository) =>
						repository.updateNotification(
							notification.ownerID as UserID,
							notification.id as NotificationID,
							message,
						),
					),
				),
		);
		await ctx.reply(
			updated
				? 'Notificação atualizada! A palavra-chave continua a mesma.'
				: 'Essa notificação não existe mais. Use /listar_notificacoes para ver suas notificações.',
		);
	}) satisfies ConversationFn;

	const deleteNotification = (async (cvs, ctx) => {
		const notification = await selectNotification(cvs, ctx);
		if (!notification) return;
		const confirmed = await showYesOrNoQuestion(
			`Deletar a notificação ${notification.keyword}? Seus destinatários e histórico também serão removidos. Chamadas da API com essa palavra-chave deixarão de funcionar.`,
		)(cvs, ctx);
		if (!confirmed) {
			await ctx.reply('Operação cancelada. A notificação foi mantida.');
			return;
		}

		const deleted = await conversationExternal(
			cvs,
			execute,
			Schema.Boolean,
			() =>
				NotificationRepository.pipe(
					Effect.andThen((repository) =>
						repository.deleteNotification(
							notification.ownerID as UserID,
							notification.id as NotificationID,
						),
					),
				),
		);
		await ctx.reply(
			deleted ? 'Notificação deletada!' : 'Essa notificação não existe mais.',
		);
	}) satisfies ConversationFn;

	const enter =
		(name: string): MiddlewareFn<Context> =>
		async (ctx) => {
			if (!ctx.user) {
				await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
				return;
			}
			await ctx.conversation.enter(name);
		};

	module.use(
		createTracedConversation(createNotification, 'createNotification'),
	);
	module.use(createTracedConversation(editNotification, 'editNotification'));
	module.use(
		createTracedConversation(deleteNotification, 'deleteNotification'),
	);
	module.setCommand(
		'criar_notificacao',
		'Cria um modelo de notificação para usar pela API',
		userMiddleware,
		enter('createNotification'),
	);
	module.setCommand(
		'listar_notificacoes',
		'Lista seus modelos de notificação',
		userMiddleware,
		async (ctx) => {
			if (!ctx.user) {
				await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
				return;
			}
			const notifications = await execute(
				getNotifications(ctx.user.id).pipe(withTelegramSpan(ctx)),
			);
			if (notifications.length === 0) {
				await ctx.reply(emptyListMessage);
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
		},
	);
	module.setCommand(
		'editar_notificacao',
		'Edita a mensagem de um modelo de notificação',
		userMiddleware,
		enter('editNotification'),
	);
	module.setCommand(
		'deletar_notificacao',
		'Deleta um modelo de notificação',
		userMiddleware,
		enter('deleteNotification'),
	);
	return module;
};
