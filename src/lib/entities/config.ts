import { createId } from '@paralleldrive/cuid2';

import { Duration } from 'tinyduration';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../database/db.js';
import { ConfigID, configsTable, PetID, UserID } from '../database/schema.js';

const Configs = {
	user: {
		identifier: UserID,
		currentPet: z.object({
			id: z.string().transform((v) => v as PetID),
			name: z.string()
		}),
		showNotifications: z.boolean()
	},
	pet: {
		identifier: PetID,
		notificationDelay: z.any({}).transform((v) => v as Duration),
		dayStart: z.object({
			hour: z.number().min(0).max(14),
			timezone: z.string()
		})
	}
};
type Configs = typeof Configs;

type ConfigContext = keyof Configs;

type ConfigKey<Context extends ConfigContext> = Exclude<keyof Configs[Context], 'identifier'>;

type ContextIdentifier<Context extends ConfigContext> = z.infer<Configs[Context]['identifier']>;

type ConfigSchema<
	Context extends ConfigContext,
	Key extends ConfigKey<Context>
> = Configs[Context][Key] extends z.ZodTypeAny ? Configs[Context][Key] : never;

export type ConfigValue<
	Context extends ConfigContext,
	Key extends ConfigKey<Context>
> = Configs[Context][Key] extends z.ZodTypeAny ? z.infer<Configs[Context][Key]> : never;

export const getConfig = async <
	Context extends ConfigContext,
	Key extends ConfigKey<Context>,
	Identifier extends ContextIdentifier<Context>
>(
	context: Context,
	key: Key,
	id: Identifier
): Promise<ConfigValue<Context, Key> | null> => {
	const queryResult = await db
		.select({ value: configsTable.value })
		.from(configsTable)
		.where(
			and(eq(configsTable.context, `${context}:${id}`), eq(configsTable.key, key as string))
		)
		.get();

	const schema = Configs[context][key] as ConfigSchema<Context, Key>;

	const result = z.nullable(schema).safeParse(queryResult?.value ?? null);

	if (result.success) {
		return result.data;
	}

	return null;
};

export const setConfig = async <
	Context extends ConfigContext,
	Key extends ConfigKey<Context>,
	Identifier extends ContextIdentifier<Context>
>(
	context: Context,
	key: Key,
	id: Identifier,
	value: ConfigValue<Context, Key>
) => {
	const schema = Configs[context][key] as ConfigSchema<Context, Key>;

	const result = z.nullable(schema).safeParse(value);

	if (!result.success) {
		throw new Error('Invalid value');
	}

	const parsedValue = result.data;

	await db
		.insert(configsTable)
		.values({
			id: createId() as ConfigID,
			context: `${context}:${id}`,
			key: key as string,
			value: parsedValue
		})
		.onConflictDoUpdate({
			target: [configsTable.context, configsTable.key],
			set: {
				value: parsedValue
			}
		});
};

export const deleteConfig = async <
	Context extends ConfigContext,
	Key extends ConfigKey<Context>,
	Identifier extends ContextIdentifier<Context>
>(
	context: Context,
	key: Key,
	id: Identifier
) => {
	await db
		.delete(configsTable)
		.where(
			and(eq(configsTable.context, `${context}:${id}`), eq(configsTable.key, key as string))
		);
};
