import {
	Array as A,
	Duration,
	Option,
	pipe,
	Record,
	Schema,
	SchemaTransformation,
} from 'effect';

export const DurationParts = Schema.Struct({
	years: Schema.optional(Schema.Number),
	months: Schema.optional(Schema.Number),
	weeks: Schema.optional(Schema.Number),
	days: Schema.optional(Schema.Number),
	hours: Schema.optional(Schema.Number),
	minutes: Schema.optional(Schema.Number),
	seconds: Schema.optional(Schema.Number),
});

export const DurationFromParts = DurationParts.pipe(
	Schema.decodeTo(
		Schema.Duration,
		SchemaTransformation.transform({
			decode: (parts) =>
				pipe(
					[
						Option.fromUndefinedOr(parts.years).pipe(
							Option.map((v) => Duration.days(v * 365)),
						),
						Option.fromUndefinedOr(parts.months).pipe(
							Option.map((v) => Duration.days(v * 30)),
						),
						Option.fromUndefinedOr(parts.weeks).pipe(
							Option.map(Duration.weeks),
						),
						Option.fromUndefinedOr(parts.days).pipe(Option.map(Duration.days)),
						Option.fromUndefinedOr(parts.hours).pipe(
							Option.map(Duration.hours),
						),
						Option.fromUndefinedOr(parts.minutes).pipe(
							Option.map(Duration.minutes),
						),
						Option.fromUndefinedOr(parts.seconds).pipe(
							Option.map(Duration.seconds),
						),
					],
					A.getSomes,
					A.reduce(Duration.zero, Duration.sum),
				),
			encode: (duration) => {
				const durationParts = Duration.parts(duration);
				const years = Math.floor(durationParts.days / 365);
				const months = Math.floor((durationParts.days - years * 365) / 30);
				const weeks = Math.floor(
					(durationParts.days - years * 365 - months * 30) / 7,
				);
				const days = durationParts.days - years * 365 - months * 30 - weeks * 7;

				return Record.filter(
					{
						years,
						months,
						weeks,
						days,
						hours: durationParts.hours,
						minutes: durationParts.minutes,
						seconds: durationParts.seconds,
					},
					(v) => v > 0,
				);
			},
		}),
	),
);
