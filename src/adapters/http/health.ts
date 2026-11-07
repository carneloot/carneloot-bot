import { Hono } from 'hono';

export const createHealthApp = (checkReadiness: () => Promise<void>) => {
	const app = new Hono();

	app.get('/healthz', (context) => context.json({ status: 'ok' }));
	app.get('/readyz', async (context) => {
		try {
			await checkReadiness();
			return context.json({ status: 'ready' });
		} catch {
			return context.json({ status: 'not-ready' }, 503);
		}
	});

	return app;
};
