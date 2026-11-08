import { describe, expect, it } from 'vitest';

import { parseMessageForMarkdown } from '../../../src/common/utils/parse-message-for-makdown.js';

describe('parseMessageForMarkdown', () => {
	it('escapes every MarkdownV2 character used in option confirmations', () => {
		expect(parseMessageForMarkdown('Ração_(manhã)|1.5g')).toBe(
			'Ração\\_\\(manhã\\)\\|1\\.5g',
		);
	});
});
