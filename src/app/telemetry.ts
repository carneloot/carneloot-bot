import * as NodeSdk from '@effect/opentelemetry/NodeSdk';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Redacted } from 'effect';

import { Env } from '../common/env.js';

export const TelemetryLive = NodeSdk.layer(() => {
	const headers = {
		Authorization: Env.OTLP_API_TOKEN
			? `Bearer ${Env.OTLP_API_TOKEN.pipe(Redacted.value)}`
			: '',
		'X-Axiom-Dataset': Env.OTLP_DATASET ?? '',
	};

	return {
		resource: {
			serviceName: 'carneloot-bot',
			serviceVersion: Env.SOURCE_COMMIT?.slice(0, 6),
		},
		spanProcessor: new BatchSpanProcessor(
			new OTLPTraceExporter(
				Env.OTLP_URL === undefined
					? undefined
					: {
							url: new URL('/v1/traces', Env.OTLP_URL).href,
							headers,
						},
			),
		),
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
	};
});
