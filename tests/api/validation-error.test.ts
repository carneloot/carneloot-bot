import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { NotifyParams } from '../../src/api/types/notify-params.js';
import { UpdateNotificationParams } from '../../src/api/types/update-notification-params.js';
import { validationErrorHook } from '../../src/api/validation-error.js';

describe('API validation responses', () => {
	const app = new Hono()
		.post(
			'/api/notify',
			sValidator('json', NotifyParams, validationErrorHook),
			(c) => c.body(null, 204),
		)
		.patch(
			'/api/notifications',
			sValidator('json', UpdateNotificationParams, validationErrorHook),
			(c) => c.body(null, 204),
		);

	it.each([
		{
			method: 'POST',
			path: '/api/notify',
			valid: { variables: { title: 'Finished' } },
			invalid: { variables: { title: false } },
		},
		{
			method: 'PATCH',
			path: '/api/notifications',
			valid: { message: '{{title}}' },
			invalid: { message: '' },
		},
	])(
		'does not expose request data on $method $path',
		async ({ method, path, valid, invalid }) => {
			const request = (body: unknown) =>
				app.request(path, {
					method,
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-secret-api-key',
					},
					body: JSON.stringify(body),
				});
			const fields = {
				apiKey: 'test-secret-api-key',
				keyword: 'test-keyword',
				privateField: 'private request data',
			};
			for (const apiKey of [fields.apiKey, { nestedSecret: fields.apiKey }]) {
				const response = await request({ ...fields, ...invalid, apiKey });
				expect(response.status).toBe(400);
				expect(await response.json()).toEqual({
					message: 'Invalid request body',
				});
			}
			expect(
				(await request({ keyword: fields.keyword, ...valid })).status,
			).toBe(204);
		},
	);
});
