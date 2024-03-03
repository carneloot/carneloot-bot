import { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard, Keyboard } from 'grammy';

import invariant from 'tiny-invariant';

import { Context } from '../types/context';

type ShowOptionsKeyboardOpts<T, AddCancel extends boolean> = {
	values: T[];
	labelFn: (value: T) => string;
	message: string;
	addCancel?: AddCancel;
	keyboardType?: 'inline' | 'custom';
};

type ShowOptionsKeyboardResponse<T, AddCancel extends boolean> = AddCancel extends true
	? T | undefined
	: T;
export const showOptionsKeyboard =
	<T, AddCancel extends boolean = false>(options: ShowOptionsKeyboardOpts<T, AddCancel>) =>
	async (
		conversation: Conversation<Context>,
		ctx: Context
	): Promise<ShowOptionsKeyboardResponse<T, AddCancel>> => {
		const keyboardType = options.keyboardType ?? 'inline';

		const keyboard = options.values.reduce(
			(keyboard, value, index) => {
				keyboard.text(options.labelFn(value), `values-${index}`);
				if ((index + 1) % 2 === 0) {
					keyboard.row();
				}
				return keyboard;
			},
			keyboardType === 'inline' ? new InlineKeyboard() : new Keyboard()
		);

		const addCancel = options.addCancel ?? false;

		if (addCancel) {
			keyboard.text('Cancelar');
		}

		await ctx.reply(options.message, { reply_markup: keyboard });

		const trigger = addCancel ? [/values-(\d+)/, 'Cancelar'] : /values-(\d+)/;

		const response = await conversation.waitForCallbackQuery(trigger, (ctx) =>
			ctx.reply('Por favor, escolha uma opção')
		);
		await response.answerCallbackQuery();

		if (addCancel && response.callbackQuery.data === 'Cancelar') {
			await ctx.reply('Operação cancelada');
			return undefined as ShowOptionsKeyboardResponse<T, AddCancel>;
		}

		const resultValue = options.values.at(+response.match[1]);

		invariant(resultValue);

		return resultValue;
	};
