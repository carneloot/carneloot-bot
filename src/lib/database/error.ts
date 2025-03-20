import { Data } from 'effect';

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
	cause: unknown;
}> {}
