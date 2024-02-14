import { EmojiFlavor } from '@grammyjs/emoji';

import { Context as GrammyContext } from 'grammy';

import { User } from '../../lib/user';

export type Context = EmojiFlavor<GrammyContext & {
	user: User | undefined;
}>;
