import { Effect } from 'effect';
import invariant from 'tiny-invariant';

import type { ConversationFn } from '../../common/types/context.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { NotificationRepository } from '../../lib/repositories/notification.js';
import { runtime } from '../../runtime.js';

export const selectNotification = (async (cvs, ctx) => {
	const user = await cvs.external((ctx) => ctx.user);
	invariant(user, 'User is not defined');

	const notifications = await cvs.external(() =>
		runtime.runPromise(
			Effect.gen(function* () {
				const repository = yield* NotificationRepository;
				return yield* repository.getNotificationsByOwner(user.id);
			}),
		),
	);
	if (notifications.length === 0) {
		await ctx.reply(
			'Você não tem notificações cadastradas. Use /criar_notificacao para criar uma.',
		);
		return;
	}

	return showOptionsKeyboard({
		values: notifications,
		labelFn: (notification) => notification.keyword,
		message: 'Escolha uma notificação. Use /cancelar para cancelar.',
		addCancel: true,
	})(cvs, ctx);
}) satisfies ConversationFn;
