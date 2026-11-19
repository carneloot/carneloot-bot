import { Schema } from 'effect';

export const UpdateNotificationParamsSchema = Schema.Struct({
	keyword: Schema.String.check(Schema.isMinLength(1)),
	message: Schema.String.check(
		Schema.isPattern(/\S/u),
		Schema.isMaxLength(4096),
	),
});

export type UpdateNotificationParams = Schema.Schema.Type<
	typeof UpdateNotificationParamsSchema
>;
export const UpdateNotificationParams = Schema.toStandardSchemaV1(
	UpdateNotificationParamsSchema,
);
