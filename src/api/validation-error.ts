import type { Context } from 'hono';

export const validationErrorHook = (
	result: { success: boolean },
	c: Context,
) => {
	if (!result.success) {
		return c.json({ message: 'Invalid request body' }, 400);
	}
};
