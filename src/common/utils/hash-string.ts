import { createHash } from 'crypto';

export const hashString = (value: string): string => {
	return createHash('sha256').update(value).digest('hex');
};
