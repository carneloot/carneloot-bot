import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Railway from '@alchemy.run/railway';
import * as Alchemy from 'alchemy';
import * as Output from 'alchemy/Output';
import * as RemovalPolicy from 'alchemy/RemovalPolicy';
import * as Digest from 'effect/crypto/Digest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';

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
		const backups = yield* Cloudflare.R2.Bucket('DatabaseBackups', {
			publicAccess: false,
			forceDestroy: false,
		}).pipe(RemovalPolicy.retain());
		const backupToken = yield* Cloudflare.ApiToken.AccountApiToken(
			'DatabaseBackupToken',
			{
				policies: [
					{
						effect: 'allow',
						permissionGroups: [
							'Workers R2 Storage Bucket Item Read',
							'Workers R2 Storage Bucket Item Write',
						],
						resources: Output.all(backups.accountId, backups.bucketName).pipe(
							Output.map(([accountId, bucketName]) => ({
								[`com.cloudflare.edge.r2.bucket.${accountId}_default_${bucketName}`]:
									'*',
							})),
						),
					},
				],
			},
		);
		const backupSecret = backupToken.value.pipe(
			Output.mapEffect((token) =>
				Digest.Digest.use((digest) =>
					digest.digestHex(
						Digest.sha256,
						new TextEncoder().encode(Redacted.value(token)),
					),
				).pipe(
					Effect.map(Redacted.make),
					Effect.provide(Digest.layerWebCrypto),
				),
			),
		);
		const bot = yield* Railway.Service('Bot', {
			project,
			name: 'bot',
			context: '.',
			dockerfilePath: 'Dockerfile',
			port: 3000,
			healthcheck: '/api/readyz',
			env: {
				...config.environment,
				DATABASE_URL: 'file:/data/carneloot.db',
				REDIS_URL: Railway.ref('redis', 'REDIS_URL'),
				DATABASE_BACKUP_ENABLED: 'true',
				DATABASE_BACKUP_CRON: '0 3 * * *',
				R2_BACKUP_BUCKET: backups.bucketName,
				R2_BACKUP_ENDPOINT: backups.accountId.pipe(
					Output.map((id) => `https://${id}.r2.cloudflarestorage.com`),
				),
				R2_BACKUP_ACCESS_KEY_ID: backupToken.tokenId,
				R2_BACKUP_SECRET_ACCESS_KEY: backupSecret,
			},
		});
		const database = yield* Railway.Volume('Database', {
			project,
			service: bot,
			mountPath: '/data',
		});
		const domain = yield* Railway.CustomDomain('BotDomain', {
			service: bot,
			environment: project,
			domain: 'bot.carneloot.com',
			targetPort: 3000,
		});
		yield* Cloudflare.DNS.RecordList('BotDomainDns', {
			zone: 'carneloot.com',
			records: domain.dnsRecords,
		});

		return {
			projectUrl: project.url,
			serviceUrl: bot.url,
			volumeId: database.volumeId,
			customDomainUrl: domain.url,
			customDomainDnsRecords: domain.dnsRecords,
			backupBucket: backups.bucketName,
		};
	}).pipe(Effect.provide(RailwayEnvironment.layer)),
);
