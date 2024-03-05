import { triggerClient } from '../src/lib/trigger/trigger-client.js';

import '../src/lib/trigger/pet-food-notification.job.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = async (request: Request) => {
	const response = await triggerClient.handleRequest(request);

	if (!response) {
		return new Response(JSON.stringify({ error: 'Not found' }), {
			status: 404,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}

	return new Response(JSON.stringify(response.body), {
		status: response.status,
		headers: response.headers
	});
};
