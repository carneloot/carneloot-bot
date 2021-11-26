import { randomBytes } from 'crypto';

export const randomString = (size: number) => randomBytes(size).toString('hex');
