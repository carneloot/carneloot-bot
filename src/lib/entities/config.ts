import { createId } from '@paralleldrive/cuid2';

import { and, eq } from 'drizzle-orm';
import { Cache, Data, Duration, Effect, Predicate, Schema } from 'effect';

import { runtime } from '../../runtime.js';
import {
	type ConfigID,
	type PetID,
	type UserID,
	configsTable
} from '../database/schema.js';

import * as CustomSchema from '../../common/schema.js';
import * as Database from '../database/db.js';

const Configs = {
	user: {
		identifier: '' as UserID,
		showNotifications: Schema.Boolean
	},
	pet: {
		identifier: '' as PetID,
		notificationDelay: CustomSchema.DurationFromParts,
		dayStart: Schema.Struct({
			hour: Schema.Number.pipe(
				Schema.greaterThan(0),
				Schema.lessThanOrEqualTo(12)
			),
			timezone: Schema.String
		})
	}
};
type Configs = typeof Configs;

type ConfigContext = keyof Configs;

type ConfigKey<Context extends ConfigContext> = Exclude<
	keyof Configs[Context],
	'identifier'
>;

type ContextIdentifier<Context extends ConfigContext> =
	Configs[Context]['identifier'];

export type ConfigValue<
	Context extends ConfigContext,
	Key extends ConfigKey<Context>
> = Configs[Context][Key] extends Schema.Schema.Any
	? Schema.Schema.Type<Configs[Context][Key]>
	: never;

class MissingConfigError<
	TContext extends ConfigContext,
	TKey extends ConfigKey<TContext>
> extends Data.TaggedError('MissingConfigError')<{
	context: TContext;
	key: TKey;
}> {}

export class ConfigService extends Effect.Service<ConfigService>()(
	'ConfigService',
	{
		dependencies: [Database.layer],
		effect: Effect.gen(function* () {
			const db = yield* Database.Database;

			const getConfigCache = yield* Cache.make({
				capacity: Number.POSITIVE_INFINITY,
				timeToLive: Duration.infinity,
				lookup: ({
					context,
					key,
					id
				}: { context: string; key: string; id: string }) =>
					db
						.execute((db) =>
							db
								.select({ value: configsTable.value })
								.from(configsTable)
								.where(
									and(
										eq(configsTable.context, `${context}:${id}`),
										eq(configsTable.key, key as string)
									)
								)
								.get()
						)
						.pipe(Effect.withSpan('getConfigLookup'))
			});

			const getConfig = <
				Context extends ConfigContext,
				Key extends ConfigKey<Context>,
				Identifier extends ContextIdentifier<Context>
			>(
				context: Context,
				key: Key,
				id: Identifier
			) =>
				Effect.gen(function* () {
					yield* Effect.annotateCurrentSpan({
						config_context: context,
						config_key: key,
						config_id: id
					});

					const cacheKey = { context, key: key.toString(), id };

					const span = yield* Effect.currentSpan;

					const queryResult = yield* getConfigCache
						.get(cacheKey)
						.pipe(Effect.withParentSpan(span));

					yield* Effect.addFinalizer(() => getConfigCache.invalidate(cacheKey));

					if (Predicate.isUndefined(queryResult)) {
						return yield* new MissingConfigError({
							context,
							key
						});
					}

					const schema = Configs[context][key] as Schema.Schema.AnyNoContext;

					const result = yield* Schema.decode(schema)(queryResult.value).pipe(
						Effect.orDieWith(
							(err) =>
								new Error(
									`Saved config (${context}:${key.toString()}:${id}) is invalid: ${err.message}`
								)
						)
					);

					return result as ConfigValue<Context, Key>;
				}).pipe(Effect.withSpan('getConfig'));

			const setConfig = <
				Context extends ConfigContext,
				Key extends ConfigKey<Context>,
				Identifier extends ContextIdentifier<Context>
			>(
				context: Context,
				key: Key,
				id: Identifier,
				value: ConfigValue<Context, Key>
			) =>
				Effect.gen(function* () {
					const schema = Configs[context][key] as Schema.Schema.AnyNoContext;

					yield* Effect.annotateCurrentSpan({
						config_context: context,
						config_key: key,
						config_id: id
					});

					const result = yield* Schema.encode(schema)(value);

					yield* db.execute((client) =>
						client
							.insert(configsTable)
							.values({
								id: createId() as ConfigID,
								context: `${context}:${id}`,
								key: key as string,
								value: result
							})
							.onConflictDoUpdate({
								target: [configsTable.context, configsTable.key],
								set: {
									value: result
								}
							})
					);
				}).pipe(Effect.withSpan('setConfig'));

			const deleteConfig = <
				Context extends ConfigContext,
				Key extends ConfigKey<Context>,
				Identifier extends ContextIdentifier<Context>
			>(
				context: Context,
				key: Key,
				id: Identifier
			) =>
				Effect.gen(function* () {
					yield* Effect.annotateCurrentSpan({
						config_context: context,
						config_key: key,
						config_id: id
					});

					yield* db.execute((client) =>
						client
							.delete(configsTable)
							.where(
								and(
									eq(configsTable.context, `${context}:${id}`),
									eq(configsTable.key, key as string)
								)
							)
					);
				}).pipe(Effect.withSpan('deleteConfig'));

			return {
				getConfig,
				setConfig,
				deleteConfig
			} as const;
		})
	}
) {}

export const getConfig = <
	Context extends ConfigContext,
	Key extends ConfigKey<Context>,
	Identifier extends ContextIdentifier<Context>
>(
	context: Context,
	key: Key,
	id: Identifier
) =>
	ConfigService.pipe(
		Effect.andThen((config) => config.getConfig(context, key, id)),
		Effect.scoped,
		runtime.runPromise
	);

export const setConfig = <
	Context extends ConfigContext,
	Key extends ConfigKey<Context>,
	Identifier extends ContextIdentifier<Context>
>(
	context: Context,
	key: Key,
	id: Identifier,
	value: ConfigValue<Context, Key>
) =>
	ConfigService.pipe(
		Effect.andThen((config) => config.setConfig(context, key, id, value)),
		runtime.runPromise
	);

export const deleteConfig = <
	Context extends ConfigContext,
	Key extends ConfigKey<Context>,
	Identifier extends ContextIdentifier<Context>
>(
	context: Context,
	key: Key,
	id: Identifier
) =>
	ConfigService.pipe(
		Effect.andThen((config) => config.deleteConfig(context, key, id)),
		runtime.runPromise
	);
