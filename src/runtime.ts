import * as NodeSdk from '@effect/opentelemetry/NodeSdk';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WorkflowEngine } from '@effect/workflow';
import { FetchHttpClient } from '@effect/platform';

import { Layer, ManagedRuntime, Redacted } from 'effect';

import { Env } from './common/env.js';
import * as Database from './lib/database/db.js';
import { ConfigService } from './lib/entities/config.js';
import { PetFoodNotificationQueue } from './lib/queues/pet-food-notification.js';
import { NotificationRepository } from './lib/repositories/notification.js';
import { PetFoodRepository } from './lib/repositories/pet-food.js';
import { NotificationService } from './lib/services/notification.js';
import { PetFoodService } from './lib/services/pet-food.js';
import { Bot } from './lib/services/bot.js';
import { StartServerWorkflowLayer } from './modules/minecraft/workflows/start-server.workflow.js';
import { DokployService } from './lib/services/dokploy/dokploy.service.js';

const traceExporter = new OTLPTraceExporter({
	url: Env.OTLP_URL,
	headers: {
		Authorization: Env.OTLP_API_TOKEN
			? `Bearer ${Env.OTLP_API_TOKEN.pipe(Redacted.value)}`
			: '',
		'X-Axiom-Dataset': Env.OTLP_DATASET ?? ''
	}
});

const jeagerExporter = new OTLPTraceExporter();

const NodeSdkLive = NodeSdk.layer(() => ({
	resource: {
		serviceName: 'carneloot-bot',
		serviceVersion: Env.SOURCE_COMMIT?.slice(0, 6)
	},
	spanProcessor: new BatchSpanProcessor(
		Env.OTLP_URL !== undefined ? traceExporter : jeagerExporter
	)
}));

const WorkflowEngineLayer = WorkflowEngine.layerMemory;

const appLayer = Layer.mergeAll(
	NodeSdkLive,
	Database.layer,
	StartServerWorkflowLayer,
	PetFoodNotificationQueue.Default,
	NotificationService.Default,
	NotificationRepository.Default,
	PetFoodRepository.Default,
	PetFoodService.Default,
	ConfigService.Default
).pipe(
	Layer.provideMerge(Bot.Default),
	Layer.provideMerge(WorkflowEngineLayer),
	Layer.provideMerge(DokployService.Default),
	Layer.provide(FetchHttpClient.layer)
);

export const runtime = ManagedRuntime.make(appLayer);
