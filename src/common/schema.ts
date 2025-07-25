import { Array as A, Duration, Option, pipe, Record, Schema } from 'effect';

export const DurationParts = Schema.Struct({
	years: Schema.optional(Schema.Number),
	months: Schema.optional(Schema.Number),
	weeks: Schema.optional(Schema.Number),
	days: Schema.optional(Schema.Number),
	hours: Schema.optional(Schema.Number),
	minutes: Schema.optional(Schema.Number),
	seconds: Schema.optional(Schema.Number)
});

export const DurationFromParts = Schema.transform(
	DurationParts,
	Schema.DurationFromSelf,
	{
		decode: (parts) =>
			pipe(
				[
					Option.fromNullable(parts.years).pipe(
						Option.map((v) => Duration.days(v * 365))
					),
					Option.fromNullable(parts.months).pipe(
						Option.map((v) => Duration.days(v * 30))
					),
					Option.fromNullable(parts.weeks).pipe(Option.map(Duration.weeks)),
					Option.fromNullable(parts.days).pipe(Option.map(Duration.days)),
					Option.fromNullable(parts.hours).pipe(Option.map(Duration.hours)),
					Option.fromNullable(parts.minutes).pipe(Option.map(Duration.minutes)),
					Option.fromNullable(parts.seconds).pipe(Option.map(Duration.seconds))
				],
				A.getSomes,
				A.reduce(Duration.zero, Duration.sum)
			),
		encode: (duration) => {
			const durationParts = Duration.parts(duration);
			const years = Math.floor(durationParts.days / 365);
			const months = Math.floor((durationParts.days - years * 365) / 30);
			const weeks = Math.floor(
				(durationParts.days - years * 365 - months * 30) / 7
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
					seconds: durationParts.seconds
				},
				(v) => v > 0
			);
		}
	}
);
