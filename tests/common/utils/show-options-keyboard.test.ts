import { describe, expect, it, vi } from 'vitest';

import { showOptionsKeyboard } from '../../../src/common/utils/show-options-keyboard.js';

describe('showOptionsKeyboard', () => {
	it('escapes the prompt and selected inline option in MarkdownV2 confirmations', async () => {
		const editMessageText = vi.fn();
		const answerCallbackQuery = vi.fn();
		const ctx = {
			api: { editMessageText },
			reply: vi.fn().mockResolvedValue({
				chat: { id: 123 },
				message_id: 456,
			}),
		};
		const cvs = {
			waitForCallbackQuery: vi.fn().mockResolvedValue({
				answerCallbackQuery,
				callbackQuery: { data: 'values-0' },
				match: ['values-0', '0'],
			}),
		};

		const result = await showOptionsKeyboard({
			message: 'Escolha_(ração).|',
			values: ['Manhã_(ração).|'],
			labelFn: (value) => value,
		})(cvs as never, ctx as never);

		expect(result).toBe('Manhã_(ração).|');
		expect(editMessageText).toHaveBeenCalledWith(
			123,
			456,
			'Escolha\\_\\(ração\\)\\.\\|\n>>Manhã\\_\\(ração\\)\\.\\|',
			{ parse_mode: 'MarkdownV2' },
		);
	});
});
