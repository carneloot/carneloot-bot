import { Composer } from 'grammy';
import { Context } from 'grammy/out/context';
import { Middleware } from 'grammy/out/composer';

import { MaybeArray } from '../types/maybe-array';
import { Command } from '../types/command';

export class Module<C extends Context> extends Composer<C> {
	private static readonly MODULE_SEPARATOR = '_';
	private static COMMANDS: Omit<Command<string>, 'middleware'>[] = [];

	constructor(
		private name: string,
		private description: string
	) {
		super();
	}

	static getCommandList() {
		return Module.COMMANDS;
	}

	setCommand<S extends string>(
		command: MaybeArray<S>,
		description: string,
		...middleware: Array<Middleware<C>>
	) {
		const newCommand = [this.name, command instanceof Array ? command[0] : command].join(
			(this.name && Module.MODULE_SEPARATOR) ?? ''
		);

		Module.COMMANDS.push({ command: newCommand, description });

		return this.command(newCommand, ...middleware);
	}
}
