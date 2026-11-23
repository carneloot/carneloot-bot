import { sValidator } from '@hono/standard-validator';
import { Effect } from 'effect';
import { Hono } from 'hono';

import type { Execute } from '../adapters/execute.js';
import type { AppServices } from '../app/layer.js';
import { NotificationRepository } from '../lib/repositories/notification.js';
import { NotificationService } from '../lib/services/notification.js';
import { type AuthVariables, createApiKeyAuth } from './auth.js';
import { CreateNotificationParams } from './types/create-notification-params.js';
import { UpdateNotificationParams } from './types/update-notification-params.js';
import { validationErrorHook } from './validation-error.js';

export const createNotificationsApi = (execute: Execute<AppServices>) =>
	new Hono<AuthVariables>()
		.post(
			'/notifications',
			createApiKeyAuth(execute),
			sValidator('json', CreateNotificationParams, validationErrorHook),
			(c) =>
				execute(
					Effect.gen(function* () {
						const repository = yield* NotificationRepository;
						const { keyword, message } = c.req.valid('json');
						const created = yield* repository.createNotification(
							c.get('user').id,
							keyword,
							message,
						);
						return created
							? c.json(
									{ message: 'Notification template created successfully!' },
									201,
								)
							: c.json(
									{
										message:
											'Notification template already exists for user and keyword',
									},
									409,
								);
					}).pipe(
						Effect.catchTag('DatabaseError', () =>
							Effect.succeed(c.json({ message: 'Database error' }, 500)),
						),
						Effect.withSpan('/api/post/notifications'),
					),
				),
		)
		.patch(
			'/notifications',
			createApiKeyAuth(execute),
			sValidator('json', UpdateNotificationParams, validationErrorHook),
			(c) =>
				execute(
					Effect.gen(function* () {
						const service = yield* NotificationService;
						return yield* service
							.updateNotificationTemplate(c.get('user'), c.req.valid('json'))
							.pipe(
								Effect.as(
									c.json({
										message: 'Notification template updated successfully!',
									}),
								),
								Effect.catchTags({
									NotificationNotFoundError: () =>
										Effect.succeed(
											c.json(
												{
													message:
														'Notification not found for user and keyword',
												},
												404,
											),
										),
									DatabaseError: () =>
										Effect.succeed(c.json({ message: 'Database error' }, 500)),
								}),
							);
					}).pipe(Effect.withSpan('/api/patch/notifications')),
				),
		);
