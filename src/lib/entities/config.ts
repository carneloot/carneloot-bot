import { createId } from '@paralleldrive/cuid2';
import { and, eq } from 'drizzle-orm';
import { Context, Data, Effect, Layer, Predicate, Schema } from 'effect';

import * as CustomSchema from '../../common/schema.js';
import * as Database from '../database/db.js';
import {
	type ConfigID,
	configsTable,
	type PetID,
	type UserID,
} from '../database/schema.js';

const Configs = {
	user: {
		identifier: '' as UserID,
		showNotifications: Schema.Boolean,
	},
	pet: {
		identifier: '' as PetID,
		notificationDelay: CustomSchema.DurationFromParts,
		dayStart: Schema.Struct({
			hour: Schema.Number.pipe(
				Schema.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(12)),
			),
			timezone: Schema.String,
		}),
	},
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
	Key extends ConfigKey<Context>,
> = Configs[Context][Key] extends Schema.Constraint
	? Schema.Schema.Type<Configs[Context][Key]>
	: never;

export class MissingConfigError<
	TContext extends ConfigContext,
	TKey extends ConfigKey<TContext>,
> extends Data.TaggedError('MissingConfigError')<{
	context: TContext;
	key: TKey;
}> {}

const makeConfigService = Effect.gen(function* () {
	const db = yield* Database.Database;

	const getConfig = <
		Context extends ConfigContext,
		Key extends ConfigKey<Context>,
		Identifier extends ContextIdentifier<Context>,
	>(
		context: Context,
		key: Key,
		id: Identifier,
		tx?: Database.Transaction,
	) =>
		Effect.gen(function* () {
			yield* Effect.annotateCurrentSpan({
				config_context: context,
				config_key: key,
				config_id: id,
			});

			const queryResult = yield* (tx ?? db.execute)((db) =>
				db
					.select({ value: configsTable.value })
					.from(configsTable)
					.where(
						and(
							eq(configsTable.context, `${context}:${id}`),
							eq(configsTable.key, key as string),
						),
					)
					.get(),
			);

			if (Predicate.isUndefined(queryResult)) {
				return yield* new MissingConfigError({
					context,
					key,
				});
			}

			const schema = Configs[context][key] as Schema.Any;

			const result = yield* Schema.decodeEffect(schema)(queryResult.value).pipe(
				Effect.catch((error) =>
					Effect.die(
						new Error(
							`Saved config (${context}:${key.toString()}:${id}) is invalid: ${error.message}`,
						),
					),
				),
			);

			return result as ConfigValue<Context, Key>;
		}).pipe(Effect.withSpan('getConfig'));

	const setConfig = <
		Context extends ConfigContext,
		Key extends ConfigKey<Context>,
		Identifier extends ContextIdentifier<Context>,
	>(
		context: Context,
		key: Key,
		id: Identifier,
		value: ConfigValue<Context, Key>,
		tx?: Database.Transaction,
	) =>
		Effect.gen(function* () {
			const schema = Configs[context][key] as Schema.Any;

			yield* Effect.annotateCurrentSpan({
				config_context: context,
				config_key: key,
				config_id: id,
			});

			const result = yield* Schema.encodeEffect(schema)(value);

			yield* (tx ?? db.execute)((client) =>
				client
					.insert(configsTable)
					.values({
						id: createId() as ConfigID,
						context: `${context}:${id}`,
						key: key as string,
						value: result,
					})
					.onConflictDoUpdate({
						target: [configsTable.context, configsTable.key],
						set: {
							value: result,
						},
					}),
			);
		}).pipe(Effect.withSpan('setConfig'));

	const deleteConfig = <
		Context extends ConfigContext,
		Key extends ConfigKey<Context>,
		Identifier extends ContextIdentifier<Context>,
	>(
		context: Context,
		key: Key,
		id: Identifier,
		tx?: Database.Transaction,
	) =>
		Effect.gen(function* () {
			yield* Effect.annotateCurrentSpan({
				config_context: context,
				config_key: key,
				config_id: id,
			});

			yield* (tx ?? db.execute)((client) =>
				client
					.delete(configsTable)
					.where(
						and(
							eq(configsTable.context, `${context}:${id}`),
							eq(configsTable.key, key as string),
						),
					),
			);
		}).pipe(Effect.withSpan('deleteConfig'));

	return {
		getConfig,
		setConfig,
		deleteConfig,
	} as const;
});

export class ConfigService extends Context.Service<
	ConfigService,
	Effect.Success<typeof makeConfigService>
>()('ConfigService') {
	declare readonly getConfig: Effect.Success<
		typeof makeConfigService
	>['getConfig'];
	declare readonly setConfig: Effect.Success<
		typeof makeConfigService
	>['setConfig'];
	declare readonly deleteConfig: Effect.Success<
		typeof makeConfigService
	>['deleteConfig'];

	static readonly layer = Layer.effect(this, makeConfigService).pipe(
		Layer.provide(Database.layer),
	);
}
