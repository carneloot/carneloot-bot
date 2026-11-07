import { describe, expect, it, vi } from 'vitest';

import { createHealthApp } from './health.js';

describe('health endpoints', () => {
	it('reports liveness without checking dependencies', async () => {
		const checkReadiness = vi.fn(async () => undefined);
		const app = createHealthApp(checkReadiness);

		const response = await app.request('/healthz');

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
		expect(checkReadiness).not.toHaveBeenCalled();
	});

	it('reports readiness only when dependency checks succeed', async () => {
		const readyApp = createHealthApp(async () => undefined);
		const unavailableApp = createHealthApp(async () => {
			throw new Error('unavailable');
		});

		expect((await readyApp.request('/readyz')).status).toBe(200);
		expect((await unavailableApp.request('/readyz')).status).toBe(503);
	});
});
