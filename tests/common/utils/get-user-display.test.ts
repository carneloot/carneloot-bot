import { describe, expect, it } from 'vitest';

import { getUserDisplay } from '../../../src/common/utils/get-user-display.js';

describe('getUserDisplay', () => {
	it('prefers a username over the user name', () => {
		expect(
			getUserDisplay({
				username: 'caramel',
				first_name: 'Carla',
				last_name: 'Silva',
			} as never),
		).toBe('@caramel');
	});

	it('uses Telegram first and last names when no username exists', () => {
		expect(
			getUserDisplay({ first_name: 'Carla', last_name: 'Silva' } as never),
		).toBe('Carla Silva');
	});

	it('uses database user field names when no username exists', () => {
		expect(
			getUserDisplay({
				telegramID: 123,
				firstName: 'Carla',
				lastName: 'Silva',
			} as never),
		).toBe('Carla Silva');
	});
});
