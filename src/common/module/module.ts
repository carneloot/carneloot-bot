// biome-ignore lint/suspicious/noShadowRestrictedNames: effect is cool
import { Array, Function, String, pipe } from 'effect';
import { Composer, type Context, type Middleware } from 'grammy';

import type { Command } from '../types/command.js';
import type { MaybeArray } from '../types/maybe-array.js';

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
		const commands = pipe(
			Array.isArray(command) ? command : [command],
			String.isNonEmpty(this.name)
				? Array.map((v) => `${this.name}${Module.MODULE_SEPARATOR}${v}`)
				: Function.identity
		);

		Module.COMMANDS.push(
			...commands.map((command) => ({ command, description }))
		);

		return this.command(commands, ...middleware);
	}
}
