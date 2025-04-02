import type { ConversationFn } from '../types/context.js';
import { showOptionsKeyboard } from './show-options-keyboard.js';

export const showYesOrNoQuestion = (message: string) =>
	(async (cvs, ctx) => {
		const result = await showOptionsKeyboard({
			message,
			values: [
				{ label: 'Sim', value: true },
				{ label: 'Não', value: false }
			],
			labelFn: ({ label }) => label
		})(cvs, ctx);
		return result.value;
	}) satisfies ConversationFn;
