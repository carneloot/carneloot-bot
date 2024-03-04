import { Context } from 'grammy';
import { Username } from '../types/username.js';

export const isUsernameOnList = (ctx: Context, users: Username[]) =>
	users.some((user) => ctx.message?.from?.username === user);
