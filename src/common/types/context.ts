import { Context as GrammyContext } from 'grammy';
import { User } from '../../lib/user';

export type Context = GrammyContext & {
	user: User | undefined;
};
