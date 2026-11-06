import { Schema } from 'effect';

export const PetDto = Schema.Struct({ id: Schema.String, name: Schema.String });
export const DayStartDto = Schema.Struct({
	hour: Schema.Number,
	timezone: Schema.String,
});
export const NotificationDelayDto = Schema.OptionFromUndefinedOr(
	Schema.DurationFromMillis,
);
export const UserDto = Schema.Struct({
	id: Schema.String,
	telegramID: Schema.String,
	username: Schema.NullOr(Schema.String),
	firstName: Schema.String,
	lastName: Schema.NullOr(Schema.String),
});
export const FoodEntryDto = Schema.Struct({
	id: Schema.String,
	quantity: Schema.Number,
	time: Schema.DateFromString,
	user: UserDto,
});
export const AddedFoodDto = Schema.Struct({ message: Schema.String });
export const EmptyOutcome = Schema.Null;
