import { sValidator } from '@hono/standard-validator';
import { Effect } from 'effect';
import { Hono } from 'hono';

import { NotificationService } from '../lib/services/notification.js';
import { runtime } from '../runtime.js';
import { apiKeyAuth } from './auth.js';
import { UpdateNotificationParams } from './types/update-notification-params.js';
import { validationErrorHook } from './validation-error.js';

export const notificationsApi = new Hono().patch(
	'/notifications',
	apiKeyAuth,
	sValidator('json', UpdateNotificationParams, validationErrorHook),
	(c) =>
		Effect.gen(function* () {
			const service = yield* NotificationService;
			return yield* service
				.updateNotificationTemplate(c.get('user'), c.req.valid('json'))
				.pipe(
					Effect.map(() =>
						c.json({ message: 'Notification template updated successfully!' }),
					),
					Effect.catchTags({
						NotificationNotFoundError: () =>
							Effect.succeed(
								c.json(
									{ message: 'Notification not found for user and keyword' },
									404,
								),
							),
						DatabaseError: () =>
							Effect.succeed(c.json({ message: 'Database error' }, 500)),
					}),
				);
		}).pipe(Effect.withSpan('/api/patch/notifications'), runtime.runPromise),
);
