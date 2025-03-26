import { Schema, Duration } from 'effect';

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
		decode: (parts) => {
			let duration = Duration.zero;

			if (parts.years) {
				duration = duration.pipe(
					Duration.sum(Duration.days(parts.years * 365))
				);
			}

			if (parts.months) {
				duration = duration.pipe(
					Duration.sum(Duration.days(parts.months * 30))
				);
			}

			if (parts.weeks) {
				duration = duration.pipe(Duration.sum(Duration.weeks(parts.weeks)));
			}

			if (parts.days) {
				duration = duration.pipe(Duration.sum(Duration.days(parts.days)));
			}

			if (parts.hours) {
				duration = duration.pipe(Duration.sum(Duration.hours(parts.hours)));
			}

			if (parts.minutes) {
				duration = duration.pipe(Duration.sum(Duration.minutes(parts.minutes)));
			}

			if (parts.seconds) {
				duration = duration.pipe(Duration.sum(Duration.seconds(parts.seconds)));
			}

			return duration;
		},
		encode: (duration) => {
			const durationParts = Duration.parts(duration);
			const years = Math.floor(durationParts.days / 365);
			const months = Math.floor((durationParts.days - years * 365) / 30);
			const weeks = Math.floor(
				(durationParts.days - years * 365 - months * 30) / 7
			);
			const days = durationParts.days - years * 365 - months * 30 - weeks * 7;

			return {
				years,
				months,
				weeks,
				days,
				hours: durationParts.hours,
				minutes: durationParts.minutes,
				seconds: durationParts.seconds
			};
		}
	}
);
