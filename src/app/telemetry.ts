import * as NodeSdk from '@effect/opentelemetry/NodeSdk';
import * as OtelTracer from '@effect/opentelemetry/OtelTracer';
import { context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Effect, Layer, Redacted } from 'effect';

import { Env } from '../common/env.js';

let contextUsers = 0;
let contextManager: AsyncLocalStorageContextManager | undefined;

const ContextPropagationLive = Layer.effectDiscard(
	Effect.acquireRelease(
		Effect.sync(() => {
			if (contextUsers++ !== 0) return;
			const manager = new AsyncLocalStorageContextManager().enable();
			if (context.setGlobalContextManager(manager)) contextManager = manager;
			else manager.disable();
		}),
		() =>
			Effect.sync(() => {
				if (--contextUsers !== 0 || !contextManager) return;
				context.disable();
				contextManager = undefined;
			}),
	),
);

export const TelemetryLive = Layer.unwrap(
	Effect.sync(() => {
		const headers = {
			Authorization: Env.OTLP_API_TOKEN
				? `Bearer ${Env.OTLP_API_TOKEN.pipe(Redacted.value)}`
				: '',
			'X-Axiom-Dataset': Env.OTLP_DATASET ?? '',
		};

		const resourcesAndLogs = NodeSdk.layer(() => ({
			resource: {
				serviceName: 'carneloot-bot',
				serviceVersion: Env.SOURCE_COMMIT?.slice(0, 6),
			},
			logRecordProcessor:
				Env.OTLP_URL === undefined
					? undefined
					: new BatchLogRecordProcessor(
							new OTLPLogExporter({
								url: new URL('/v1/logs', Env.OTLP_URL).href,
								headers,
							}),
						),
			loggerMergeWithExisting: true,
		}));

		// Expose the native tracer as well as Effect's tracer, without registering
		// a second global provider for grammY instrumentation.
		return OtelTracer.layer.pipe(
			Layer.provide(
				NodeSdk.layerTracerProvider(
					new BatchSpanProcessor(
						new OTLPTraceExporter(
							Env.OTLP_URL === undefined
								? undefined
								: {
										url: new URL('/v1/traces', Env.OTLP_URL).href,
										headers,
									},
						),
					),
				),
			),
			Layer.provideMerge(resourcesAndLogs),
		);
	}),
).pipe(Layer.provide(ContextPropagationLive));
