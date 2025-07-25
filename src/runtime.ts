import * as NodeSdk from '@effect/opentelemetry/NodeSdk';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Layer, ManagedRuntime, Redacted } from 'effect';
import { Env } from './common/env.js';
import * as Database from './lib/database/db.js';
import { ConfigService } from './lib/entities/config.js';
import { PetFoodRepository } from './lib/repositories/pet-food.js';
import { PetFoodService } from './lib/services/pet-food.js';

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

const appLayer = Layer.mergeAll(
	NodeSdkLive,
	Database.layer,
	ConfigService.Default,
	PetFoodRepository.Default,
	PetFoodService.Default
);

export const runtime = ManagedRuntime.make(appLayer);
