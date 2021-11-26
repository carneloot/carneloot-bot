export type MaybeFunction<Return, Args extends unknown[] = unknown[]> = Return | ((...args: Args) => Return);

export const flattenMaybeFunction = <T, Args extends unknown[]>(
    value: MaybeFunction<T, Args>,
    ...args: Args
): T => value instanceof Function ? value(...args) : value;
