import { Schema } from 'effect';

import { UpdateNotificationParamsSchema } from './update-notification-params.js';

export const CreateNotificationParamsSchema = Schema.Struct({
	keyword: Schema.String.check(Schema.isPattern(/^\S+$/u)),
	message: UpdateNotificationParamsSchema.fields.message,
});

export type CreateNotificationParams = Schema.Schema.Type<
	typeof CreateNotificationParamsSchema
>;
export const CreateNotificationParams = Schema.toStandardSchemaV1(
	CreateNotificationParamsSchema,
);
