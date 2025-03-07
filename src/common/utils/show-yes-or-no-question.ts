import type { ConversationFn } from '@grammyjs/conversations';

import type { Context } from '../types/context.js';
import { showOptionsKeyboard } from './show-options-keyboard.js';

export const showYesOrNoQuestion = (message: string) =>
	(async (cvs, ctx) => {
		const answer = await showOptionsKeyboard({
			values: [
				{ label: 'Sim', value: true },
				{ label: 'Não', value: false }
			],
			message,
			labelFn: (v) => v.label
		})(cvs, ctx);

		return answer.value;
	}) satisfies ConversationFn<Context>;
