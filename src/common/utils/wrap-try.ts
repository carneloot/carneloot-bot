import { MaybePromise } from '../types/maybe-promise.js';

export const wrapTry = async <T, E>(
	fn: () => MaybePromise<T>,
	defaultError?: (err: unknown) => MaybePromise<E>
) => {
	try {
		return await fn();
	} catch (err) {
		if (defaultError) {
			return defaultError(err);
		}

		throw err;
	}
};
