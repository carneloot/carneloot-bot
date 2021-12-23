import { Context } from 'grammy';
import { Username } from '../types/username';

export const isUsernameOnList = (ctx: Context, users: Username[]) => users.some(user => ctx.message?.from?.username === user);
