import { Schema } from 'effect';

export const NotifyParamsSchema = Schema.Struct({
	keyword: Schema.String,
	variables: Schema.UndefinedOr(
		Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number])),
	),
});

export type NotifyParams = Schema.Schema.Type<typeof NotifyParamsSchema>;
