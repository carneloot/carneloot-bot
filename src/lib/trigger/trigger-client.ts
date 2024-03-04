import { TriggerClient } from '@trigger.dev/sdk';

export const triggerClient = new TriggerClient({
	id: 'carneloot-bot',
	apiKey: process.env.TRIGGER_API_KEY
});
