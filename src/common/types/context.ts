import type { ConversationFlavor } from '@grammyjs/conversations';
import type { EmojiFlavor } from '@grammyjs/emoji';

import type { Context as GrammyContext, SessionFlavor } from 'grammy';

import type { User } from '../../lib/entities/user.js';

import type { SessionData } from './session.js';

type MyContext = {
	user: User | undefined;
};

export type Context = SessionFlavor<SessionData> &
	ConversationFlavor<EmojiFlavor<GrammyContext & MyContext>>;
