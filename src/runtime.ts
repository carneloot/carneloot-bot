import { Layer, ManagedRuntime, Redacted } from 'effect';

import * as NodeSdk from '@effect/opentelemetry/NodeSdk';

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
	BatchSpanProcessor,
	ConsoleSpanExporter
} from '@opentelemetry/sdk-trace-base';

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

const consoleExporter = new ConsoleSpanExporter();

const NodeSdkLive = NodeSdk.layer(() => ({
	resource: { serviceName: 'carneloot-bot' },
	spanProcessor: new BatchSpanProcessor(
		Env.OTLP_URL !== undefined ? traceExporter : consoleExporter
	)
}));

const appLayer = Layer.mergeAll(
	// There is some problem with telemetry right now. Apparently it is fixed on bun 1.2.9, test it then.
	NodeSdkLive,
	Database.layer,
	PetFoodRepository.Default
);

export const runtime = ManagedRuntime.make(appLayer);
