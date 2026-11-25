import { Effect, Layer, Schema } from 'effect';
import {
	HttpApi,
	HttpApiBuilder,
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
} from 'effect/http-api';

import { NotificationRepository } from '../lib/repositories/notification.js';
import { NotificationService } from '../lib/services/notification.js';
import { ApiKeyAuth, ApiKeyAuthLive, AuthenticatedUser } from './auth.js';
import {
	DatabaseErrorResponse,
	RequestValidation,
	RequestValidationLive,
} from './errors.js';
import { CreateNotificationParamsSchema } from './types/create-notification-params.js';
import { NotifyParamsSchema } from './types/notify-params.js';
import { UpdateNotificationParamsSchema } from './types/update-notification-params.js';

const NotificationNotFound = Schema.Struct({
	message: Schema.Literal('Notification not found for user and keyword'),
}).pipe(HttpApiSchema.status(404));

export const NotificationsGroup = HttpApiGroup.make('notifications')
	.add(
		HttpApiEndpoint.post('create', '/api/notifications', {
			payload: CreateNotificationParamsSchema,
			success: Schema.Struct({
				message: Schema.Literal('Notification template created successfully!'),
			}).pipe(HttpApiSchema.status(201)),
			error: [
				DatabaseErrorResponse,
				Schema.Struct({
					message: Schema.Literal(
						'Notification template already exists for user and keyword',
					),
				}).pipe(HttpApiSchema.status(409)),
			],
		}),
		HttpApiEndpoint.patch('update', '/api/notifications', {
			payload: UpdateNotificationParamsSchema,
			success: Schema.Struct({
				message: Schema.Literal('Notification template updated successfully!'),
			}),
			error: [DatabaseErrorResponse, NotificationNotFound],
		}),
		HttpApiEndpoint.post('notify', '/api/notify', {
			payload: NotifyParamsSchema,
			success: [
				Schema.Struct({
					message: Schema.Literal('Notification sent successfully!'),
				}),
				Schema.Struct({
					message: Schema.Literal('Notification partially delivered'),
					delivered: Schema.Number,
					failed: Schema.Number,
				}).pipe(HttpApiSchema.status(207)),
			],
			error: [
				DatabaseErrorResponse,
				NotificationNotFound,
				Schema.Struct({
					message: Schema.Literal('Missing used variables'),
					variables: Schema.Array(Schema.String),
				}).pipe(HttpApiSchema.status(422)),
				Schema.Struct({
					message: Schema.Literal('Notification delivery failed'),
					failed: Schema.Number,
				}).pipe(HttpApiSchema.status(502)),
			],
		}),
	)
	.middleware(RequestValidation)
	.middleware(ApiKeyAuth);

export const NotificationsApi =
	HttpApi.make('CarnelootBot').add(NotificationsGroup);

export const NotificationsLive = HttpApiBuilder.group(
	NotificationsApi,
	'notifications',
	(handlers) =>
		Effect.gen(function* () {
			const repository = yield* NotificationRepository;
			const service = yield* NotificationService;
			return handlers
				.handle('create', ({ payload }) =>
					Effect.gen(function* () {
						const { user } = yield* AuthenticatedUser;
						const created = yield* repository.createNotification(
							user.id,
							payload.keyword,
							payload.message,
						);
						if (!created) {
							return yield* Effect.fail({
								message:
									'Notification template already exists for user and keyword' as const,
							});
						}
						return {
							message: 'Notification template created successfully!' as const,
						};
					}).pipe(
						Effect.catchTag('DatabaseError', () =>
							Effect.fail({ message: 'Database error' as const }),
						),
					),
				)
				.handle('update', ({ payload }) =>
					Effect.gen(function* () {
						const { user } = yield* AuthenticatedUser;
						yield* service.updateNotificationTemplate(user, payload);
						return {
							message: 'Notification template updated successfully!' as const,
						};
					}).pipe(
						Effect.catchTags({
							DatabaseError: () =>
								Effect.fail({ message: 'Database error' as const }),
							NotificationNotFoundError: () =>
								Effect.fail({
									message:
										'Notification not found for user and keyword' as const,
								}),
						}),
					),
				)
				.handle('notify', ({ payload }) =>
					Effect.gen(function* () {
						const { user } = yield* AuthenticatedUser;
						const outcome = yield* service.sendNotification(user, payload);
						return outcome.failed === 0
							? { message: 'Notification sent successfully!' as const }
							: {
									message: 'Notification partially delivered' as const,
									...outcome,
								};
					}).pipe(
						Effect.catchTags({
							NotificationDeliveryError: (error) =>
								Effect.fail({
									message: 'Notification delivery failed' as const,
									failed: error.attempted,
								}),
							MissingVariablesError: (error) =>
								Effect.fail({
									message: 'Missing used variables' as const,
									variables: error.variables,
								}),
							NotificationNotFoundError: () =>
								Effect.fail({
									message:
										'Notification not found for user and keyword' as const,
								}),
							DatabaseError: () =>
								Effect.fail({ message: 'Database error' as const }),
						}),
					),
				);
		}),
).pipe(Layer.provide([ApiKeyAuthLive, RequestValidationLive]));
