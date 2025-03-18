import { Schema } from 'effect';

export const NotifyParamsSchema = Schema.Struct({
	apiKey: Schema.String,
	keyword: Schema.String,
	variables: Schema.UndefinedOr(
		Schema.Record({
			key: Schema.String,
			value: Schema.Union(Schema.String, Schema.Number)
		})
	)
});

export type NotifyParams = Schema.Schema.Type<typeof NotifyParamsSchema>;
export const NotifyParams = Schema.standardSchemaV1(NotifyParamsSchema);
