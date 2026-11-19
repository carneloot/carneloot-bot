import { sValidator } from '@hono/standard-validator';
import { Effect } from 'effect';
import { Hono } from 'hono';

import { NotificationService } from '../lib/services/notification.js';
import { runtime } from '../runtime.js';
import { UpdateNotificationParams } from './types/update-notification-params.js';

export const notificationsApi = new Hono().patch(
	'/notifications',
	sValidator('json', UpdateNotificationParams),
	(c) =>
		Effect.gen(function* () {
			const service = yield* NotificationService;
			return yield* service
				.updateNotificationTemplate(c.req.valid('json'))
				.pipe(
					Effect.map(() =>
						c.json({ message: 'Notification template updated successfully!' }),
					),
					Effect.catchTags({
						UserNotFoundError: () =>
							Effect.succeed(
								c.json({ message: 'User not found for apiKey' }, 404),
							),
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
