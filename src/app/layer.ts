import * as NodeSdk from '@effect/opentelemetry/NodeSdk';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Layer, ManagedRuntime, Redacted } from 'effect';

import { PetFoodNotificationQueue } from '../adapters/queue/pet-food-notification.js';
import {
	ConversationPersistence,
	ConversationPersistenceLive,
} from '../adapters/telegram/conversation-storage.js';
import { NotificationSenderLive } from '../adapters/telegram/notification-sender.js';
import { Env } from '../common/env.js';
import * as Database from '../lib/database/db.js';
import { ConfigService } from '../lib/entities/config.js';
import { RedisLive } from '../lib/redis/redis.js';
import { NotificationRepository } from '../lib/repositories/notification.js';
import { PetFoodRepository } from '../lib/repositories/pet-food.js';
import { PetRepository } from '../lib/repositories/pet.js';
import { UserRepository } from '../lib/repositories/user.js';
import { NotificationService } from '../lib/services/notification.js';
import { PetFoodService } from '../lib/services/pet-food.js';

const traceExporter = new OTLPTraceExporter({
	url: Env.OTLP_URL,
	headers: {
		Authorization: Env.OTLP_API_TOKEN
			? `Bearer ${Env.OTLP_API_TOKEN.pipe(Redacted.value)}`
			: '',
		'X-Axiom-Dataset': Env.OTLP_DATASET ?? '',
	},
});

const jeagerExporter = new OTLPTraceExporter();

const NodeSdkLive = NodeSdk.layer(() => ({
	resource: {
		serviceName: 'carneloot-bot',
		serviceVersion: Env.SOURCE_COMMIT?.slice(0, 6),
	},
	spanProcessor: new BatchSpanProcessor(
		Env.OTLP_URL !== undefined ? traceExporter : jeagerExporter,
	),
}));

const RedisServicesLive = Layer.mergeAll(
	ConversationPersistenceLive,
	PetFoodNotificationQueue.layer,
);

const AppServicesLive = Layer.mergeAll(
	NodeSdkLive,
	Database.layer,
	RedisServicesLive,
	NotificationService.layer.pipe(Layer.provide(NotificationSenderLive)),
	NotificationRepository.layer,
	PetRepository.layer,
	PetFoodRepository.layer,
	UserRepository.layer,
	PetFoodService.layer,
	ConfigService.layer,
);

export const appLayer = AppServicesLive.pipe(
	Layer.provide(RedisLive),
	Layer.provide(NotificationSenderLive),
);

export type AppServices =
	| Database.Database
	| ConversationPersistence
	| PetFoodNotificationQueue
	| NotificationService
	| NotificationRepository
	| PetRepository
	| PetFoodRepository
	| UserRepository
	| PetFoodService
	| ConfigService;

export const runtime = ManagedRuntime.make(appLayer);
