import { Layer, ManagedRuntime, Redacted } from 'effect';

import { NodeSdk } from '@effect/opentelemetry';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

import * as Database from './lib/database/db.js';

import { Env } from './common/env.js';
import { PetFoodRepository } from './lib/repositories/pet-food.js';

const traceExporter = new OTLPTraceExporter({
	url: Env.OTLP_URL,
	headers: {
		Authorization: Env.OTLP_API_TOKEN
			? `Bearer ${Env.OTLP_API_TOKEN.pipe(Redacted.value)}`
			: '',
		'X-Axiom-Dataset': Env.OTLP_DATASET ?? ''
	}
});

const NodeSdkLive = NodeSdk.layer(() => ({
	resource: { serviceName: 'carneloot-bot' },
	spanProcessor: new BatchSpanProcessor(traceExporter)
}));

const appLayer = Layer.mergeAll(
	NodeSdkLive,
	Database.layer,
	PetFoodRepository.Default
);

export const runtime = ManagedRuntime.make(appLayer);
