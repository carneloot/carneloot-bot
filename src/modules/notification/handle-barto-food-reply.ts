import { Reactions } from '@grammyjs/emoji';

import Qty from 'js-quantities';

import { Context } from '../../common/types/context';
import { getNotificationFromHistory } from '../../lib/notification';

type Notification = Awaited<ReturnType<typeof getNotificationFromHistory>> & object;

const WEIGHT_REGEX = /(\d+(\.\d+)?)(\s?)(mg|g|kg)\b/i;

export const handleBartoFoodReply = async (ctx: Context, notification: Notification) => {
	if (!ctx.message) {
		throw new Error('Message object not found.');
	}

	const weightMatch = ctx.message.text?.match(WEIGHT_REGEX) ?? null;

	if (!weightMatch) {
		await ctx.reply('Por favor mande um peso na mensagem', {
			reply_to_message_id: ctx.message.message_id
		});
		return;
	}

	const weightStr = weightMatch.at(0)!.trim();
	const weightQty = weightStr.match(/(mg|g|kg)$/) ? Qty(weightStr) : Qty(`${weightStr}g`);
	const weight = Math.floor(weightQty.to('g').scalar);

	const message = `BARTO_FOOD:${weight}`;

	await ctx.api.sendMessage(notification.ownerTelegramId, message, {
		reply_to_message_id: notification.messageToReply
	});

	await ctx.react(Reactions.thumbs_up);
};
