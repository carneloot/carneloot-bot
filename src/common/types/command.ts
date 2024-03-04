import { MaybeArray } from './maybe-array.js';
import { MiddlewareObj } from 'grammy';

export type Command<S extends MaybeArray<string>> = MiddlewareObj & {
	command: S;
	description: string;
};

export const getCommandForHelp = <S extends MaybeArray<string>>(command: Command<S>): string =>
	Array.isArray(command.command) ? command.command[0] : command.command;

export const getDescriptionForHelp = <S extends MaybeArray<string>>(command: Command<S>): string =>
	command.description ?? '';
