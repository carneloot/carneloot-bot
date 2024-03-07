import { Env } from '../env.js';

export const isDebug = () => Boolean(Env.DEBUG);
