import { createId } from '@paralleldrive/cuid2';

import { Env } from '../env.js';

export const publicAsset = (path: string) =>
	Env.VERCEL_URL
		? `https://${Env.VERCEL_URL}/${path}`
		: `https://picsum.photos/400/300?random=${createId()}`;
