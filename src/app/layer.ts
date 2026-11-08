import * as NodeSdk from '@effect/opentelemetry/NodeSdk';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Layer, ManagedRuntime, Redacted } from 'effect';

import { PetFoodNotificationQueue } from '../adapters/queue/pet-food-notification.js';
import {
	ConversationPersistence,
	ConversationPersistenceLive,
} from '../adapters/telegram/conversation-storage.js';
import {
	NotificationSender,
	NotificationSenderLive,
} from '../adapters/telegram/notification-sender.js';
import { Env } from '../common/env.js';
import * as Database from '../lib/database/db.js';
import { ConfigService } from '../lib/entities/config.js';
import { Redis, RedisLive } from '../lib/redis/redis.js';
import { NotificationRepository } from '../lib/repositories/notification.js';
import { PetFoodSchedulingOutboxRepository } from '../lib/repositories/pet-food-scheduling-outbox.js';
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

const PersistenceLive = Layer.mergeAll(
	NotificationRepository.layer,
	PetRepository.layer,
	PetFoodRepository.layer,
	PetFoodSchedulingOutboxRepository.layer,
	UserRepository.layer,
	ConfigService.layer,
).pipe(Layer.provideMerge(Database.layer));

const NotificationServicesLive = NotificationService.layer.pipe(
	Layer.provideMerge(Layer.mergeAll(PersistenceLive, NotificationSenderLive)),
);

const QueueServicesLive = Layer.mergeAll(
	ConversationPersistenceLive,
	PetFoodNotificationQueue.layer,
).pipe(Layer.provideMerge(Layer.mergeAll(NotificationServicesLive, RedisLive)));

const AppServicesLive = Layer.mergeAll(
	NodeSdkLive,
	PetFoodService.layer.pipe(Layer.provideMerge(QueueServicesLive)),
);

export const appLayer = AppServicesLive;

export type AppServices =
	| Database.Database
	| ConversationPersistence
	| PetFoodNotificationQueue
	| NotificationService
	| NotificationRepository
	| PetRepository
	| PetFoodRepository
	| PetFoodSchedulingOutboxRepository
	| UserRepository
	| PetFoodService
	| ConfigService
	| Redis
	| NotificationSender;

export const runtime = ManagedRuntime.make(appLayer);
