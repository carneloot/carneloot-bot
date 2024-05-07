import type { Context } from 'grammy';
import type { Username } from '../types/username.js';

export const isUsernameOnList = (ctx: Context, users: Username[]) =>
	users.some((user) => ctx.message?.from?.username === user);
