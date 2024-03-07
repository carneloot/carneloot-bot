import { TriggerClient } from '@trigger.dev/sdk';
import { Env } from '../../common/env.js';

export const triggerClient = new TriggerClient({
	id: 'carneloot-bot',
	apiKey: Env.TRIGGER_API_KEY
});
