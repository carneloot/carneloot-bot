import { eventTrigger } from '@trigger.dev/sdk';

import { triggerClient } from './trigger.js';

triggerClient.defineJob({
	id: 'example-job',
	name: 'Example Job',
	version: '0.0.1',
	trigger: eventTrigger({
		name: 'example.event'
	}),
	run: async (payload, io) => {
		await io.logger.info('Hello world!', { payload });

		return {
			message: 'Hello world!'
		};
	}
});
