import { describe, expect, it } from 'vitest';

import {
	getCommandForHelp,
	getDescriptionForHelp,
	type Command,
} from '../../../src/common/types/command.js';

describe('command help metadata', () => {
	it('uses the first alias as the help command', () => {
		const command = {
			command: ['alimentar', 'ração'],
			description: 'Registra uma alimentação',
		} as unknown as Command<['alimentar', 'ração']>;

		expect(getCommandForHelp(command)).toBe('alimentar');
	});

	it('uses an empty description when a command omits one', () => {
		const command = { command: 'ping' } as unknown as Command<'ping'>;

		expect(getDescriptionForHelp(command)).toBe('');
	});
});
