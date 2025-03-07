import { createId } from '@paralleldrive/cuid2';

import { Env } from '../env.js';

export const publicAsset = (path: string) =>
	Env.COOLIFY_URL
		? `${Env.COOLIFY_URL}/${path}`
		: `https://picsum.photos/400/300?random=${createId()}`;
