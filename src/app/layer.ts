import { Layer, ManagedRuntime } from 'effect';

import { PetFoodNotificationQueue } from '../adapters/queue/pet-food-notification.js';
import { TelegramBotLive } from '../adapters/telegram/bot.js';
import {
	ConversationPersistence,
	ConversationPersistenceLive,
} from '../adapters/telegram/conversation-storage.js';
import {
	NotificationSender,
	NotificationSenderLive,
} from '../adapters/telegram/notification-sender.js';
import * as Database from '../lib/database/db.js';
import { ConfigService } from '../lib/entities/config.js';
import { Redis, RedisLive } from '../lib/redis/redis.js';
import { NotificationRepository } from '../lib/repositories/notification.js';
import { PetFoodRepository } from '../lib/repositories/pet-food.js';
import { PetRepository } from '../lib/repositories/pet.js';
import { UserRepository } from '../lib/repositories/user.js';
import { NotificationService } from '../lib/services/notification.js';
import { PetFoodService } from '../lib/services/pet-food.js';
import { TelemetryLive } from './telemetry.js';

const PersistenceLive = Layer.mergeAll(
	NotificationRepository.layer,
	PetRepository.layer,
	PetFoodRepository.layer,
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

const AppServicesLive = PetFoodService.layer.pipe(
	Layer.provideMerge(QueueServicesLive),
	Layer.provideMerge(TelemetryLive),
);

export const appLayer = TelegramBotLive.pipe(
	Layer.provideMerge(AppServicesLive),
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
	| ConfigService
	| Redis
	| NotificationSender;

export const runtime = ManagedRuntime.make(appLayer);
