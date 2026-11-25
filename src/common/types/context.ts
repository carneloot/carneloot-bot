import type { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import type { EmojiFlavor } from '@grammyjs/emoji';
import type { Tracer } from 'effect';
import type { Context as GrammyContext } from 'grammy';

import type { User } from '../../lib/repositories/user.js';

type MyContext = {
	user: User | undefined;
	span?: Tracer.Span | undefined;
};

export type Context = ConversationFlavor<
	EmojiFlavor<GrammyContext & MyContext>
>;

export type ConversationContext = EmojiFlavor<
	GrammyContext & Pick<MyContext, 'span'>
>;

export type ConversationFn = (
	cvs: Conversation<Context, ConversationContext>,
	ctx: ConversationContext,
) => Promise<unknown>;
