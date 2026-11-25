import { Effect, Layer } from 'effect';
import { HttpStaticServer } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import {
	NotificationsApi,
	NotificationsLive,
} from '../../api/notifications.js';
import { Env } from '../../common/env.js';
import { HealthLive } from './health.js';
import { TelegramWebhookLive } from './webhook.js';

export const HttpLive = Layer.unwrap(
	Effect.sync(() =>
		Layer.mergeAll(
			HealthLive,
			HttpApiBuilder.layer(NotificationsApi).pipe(
				Layer.provide(NotificationsLive),
			),
			Env.RUN_MODE === 'webhook' ? TelegramWebhookLive : Layer.empty,
			HttpStaticServer.layer({ root: '../public/' }),
		),
	),
);
