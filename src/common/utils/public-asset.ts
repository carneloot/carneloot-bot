import { randomString } from './random-string';

const { VERCEL_URL, VERCEL } = process.env;

export const publicAsset = (path: string) => VERCEL && VERCEL_URL
    ? `https://${VERCEL_URL}/${path}`
    : `https://picsum.photos/400/300?random=${randomString(10)}`;
