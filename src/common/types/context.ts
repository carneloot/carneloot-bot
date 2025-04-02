import type { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import type { EmojiFlavor } from '@grammyjs/emoji';

import type { Context as GrammyContext } from 'grammy';

import type { User } from '../../lib/entities/user.js';

type MyContext = {
	user: User | undefined;
};

export type Context = ConversationFlavor<
	EmojiFlavor<GrammyContext & MyContext>
>;

export type ConversationContext = EmojiFlavor<GrammyContext>;

export type ConversationFn = (
	cvs: Conversation<Context, ConversationContext>,
	ctx: ConversationContext
) => Promise<unknown>;
