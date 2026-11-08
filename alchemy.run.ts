import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Railway from '@alchemy.run/railway';
import * as Alchemy from 'alchemy';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { RailwayEnvironment } from './infrastructure/railway-environment.js';

export default Alchemy.Stack(
	'CarnelootBot',
	{
		providers: Layer.mergeAll(Railway.providers(), Cloudflare.providers()),
		state: Cloudflare.state(),
	},
	Effect.gen(function* () {
		const config = yield* RailwayEnvironment;

		const project = yield* Railway.Project('Project', {
			name: 'carneloot-bot',
			description: 'Carneloot Telegram bot',
		});
		yield* Railway.Redis('Redis', {
			project,
			name: 'redis',
		});
		const bot = yield* Railway.Service('Bot', {
			project,
			name: 'bot',
			context: '.',
			dockerfilePath: 'Dockerfile',
			port: 3000,
			env: {
				...config.environment,
				DATABASE_URL: 'file:/data/carneloot.db',
				REDIS_URL: Railway.ref('redis', 'REDIS_URL'),
			},
		});
		const database = yield* Railway.Volume('Database', {
			project,
			service: bot,
			mountPath: '/data',
		});

		return {
			projectUrl: project.url,
			serviceUrl: bot.url,
			volumeId: database.volumeId,
		};
	}).pipe(Effect.provide(RailwayEnvironment.layer)),
);
