import type { MiddlewareObj } from 'grammy';

import type { Context } from './context.js';
import type { MaybeRequiredArray } from './maybe-array.js';

export type Command<S extends MaybeRequiredArray<string>> =
	MiddlewareObj<Context> & {
		command: S;
		description: string;
	};

export const getCommandForHelp = <S extends MaybeRequiredArray<string>>(
	command: Command<S>,
): string =>
	Array.isArray(command.command) ? command.command[0] : command.command;

export const getDescriptionForHelp = <S extends MaybeRequiredArray<string>>(
	command: Command<S>,
): string => command.description ?? '';
