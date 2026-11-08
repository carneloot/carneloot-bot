import type { Effect } from 'effect';

/**
 * Runs an Effect from a Promise-only adapter callback.
 *
 * The application scope owns the implementation. Adapters receive this
 * capability rather than importing a global runtime.
 */
export interface Execute<Requirements> {
	<Value, Error>(
		effect: Effect.Effect<Value, Error, Requirements>,
	): Promise<Value>;
}
