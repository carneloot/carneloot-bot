import type { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard, Keyboard } from 'grammy';

import invariant from 'tiny-invariant';

import type { Context } from '../types/context.js';
import { parseMessageForMarkdown } from './parse-message-for-makdown.js';

type ShowOptionsKeyboardOpts<T, AddCancel extends boolean> = {
	values: T[];
	labelFn: (value: T) => string;
	message: string;
	addCancel?: AddCancel;
	keyboardType?: 'inline' | 'custom';
	/** number of items per row */
	rowNum?: number;
};

type ShowOptionsKeyboardResponse<
	T,
	AddCancel extends boolean
> = AddCancel extends true ? T | undefined : T;
export const showOptionsKeyboard =
	<T, AddCancel extends boolean = false>(
		options: ShowOptionsKeyboardOpts<T, AddCancel>
	) =>
	async (
		conversation: Conversation<Context>,
		ctx: Context
	): Promise<ShowOptionsKeyboardResponse<T, AddCancel>> => {
		const keyboardType = options.keyboardType ?? 'inline';
		const rowNum = options.rowNum ?? 2;

		const keyboard = options.values.reduce(
			(keyboard, value, index) => {
				keyboard.text(options.labelFn(value), `values-${index}`);
				if ((index + 1) % rowNum === 0) {
					keyboard.row();
				}
				return keyboard;
			},
			keyboardType === 'inline' ? new InlineKeyboard() : new Keyboard()
		);

		if (keyboard instanceof Keyboard) {
			keyboard.oneTime();
		}

		const addCancel = options.addCancel ?? false;

		if (addCancel) {
			keyboard.text('Cancelar');
		}

		const optionsMessage = await ctx.reply(options.message, {
			reply_markup: keyboard
		});

		if (keyboard instanceof InlineKeyboard) {
			const trigger = addCancel ? [/values-(\d+)/, 'Cancelar'] : /values-(\d+)/;

			const response = await conversation.waitForCallbackQuery(trigger, (ctx) =>
				ctx.reply('Por favor, escolha uma opção')
			);
			await response.answerCallbackQuery();

			if (addCancel && response.callbackQuery.data === 'Cancelar') {
				await ctx.api.editMessageText(
					optionsMessage.chat.id,
					optionsMessage.message_id,
					`${parseMessageForMarkdown(options.message)}\n>>Cancelado`,
					{
						parse_mode: 'MarkdownV2'
					}
				);

				return undefined as ShowOptionsKeyboardResponse<T, AddCancel>;
			}

			const rawValue = response.match[1];

			invariant(rawValue, 'Could not find value');

			const resultValue = options.values.at(+rawValue);

			invariant(resultValue);

			await ctx.api.editMessageText(
				optionsMessage.chat.id,
				optionsMessage.message_id,
				`${parseMessageForMarkdown(options.message)}\n>>${parseMessageForMarkdown(options.labelFn(resultValue))}`,
				{
					parse_mode: 'MarkdownV2'
				}
			);

			return resultValue;
		}

		const selectOptions = new Map<string, T | undefined>(
			options.values.map((value) => [options.labelFn(value), value])
		);
		if (addCancel) {
			selectOptions.set('Cancelar', undefined);
		}

		const response = await conversation.form.select(
			[...selectOptions.keys()],
			(ctx) => ctx.reply('Por favor, escolha uma opção')
		);

		if (response === 'Cancelar') {
			await ctx.reply('Operação cancelada');
			return undefined as ShowOptionsKeyboardResponse<T, AddCancel>;
		}

		return selectOptions.get(response) as ShowOptionsKeyboardResponse<
			T,
			AddCancel
		>;
	};
