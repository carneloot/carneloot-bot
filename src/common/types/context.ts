import type { ConversationFlavor } from '@grammyjs/conversations';
import { EmojiFlavor } from '@grammyjs/emoji';

import { Context as GrammyContext, SessionFlavor } from 'grammy';

import { User } from '../../lib/entities/user';

import { SessionData } from './session';

type MyContext = {
	user: User | undefined;
};

export type Context = SessionFlavor<SessionData> &
	ConversationFlavor<EmojiFlavor<GrammyContext & MyContext>>;
