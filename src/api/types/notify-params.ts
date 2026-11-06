import { Schema } from 'effect';

export const NotifyParamsSchema = Schema.Struct({
	apiKey: Schema.String,
	keyword: Schema.String,
	variables: Schema.UndefinedOr(
		Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number])),
	),
});

export type NotifyParams = Schema.Schema.Type<typeof NotifyParamsSchema>;
export const NotifyParams = Schema.toStandardSchemaV1(NotifyParamsSchema);
