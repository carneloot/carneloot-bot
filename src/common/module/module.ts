import { Composer } from 'grammy';
import { Context } from 'grammy/out/context';
import { MaybeArray } from '../types/maybe-array';
import { Middleware } from 'grammy/out/composer';
import { Command } from '../types/command';

export class Module<C extends Context> extends Composer<C> {
    private static readonly MODULE_SEPARATOR = '_';
    private static COMMANDS: Command<string>[] = [];

    private parent?: Module<C>;

    constructor(
        private name: string,
        private description: string,
    ) {
        super();
    }

    static getCommandList(): Command<string>[] {
        return Module.COMMANDS;
    }

    private getModuleName() {
        const parentName = this.parent?.name ?? '';
        if (parentName) {
            return [parentName, this.name].join(Module.MODULE_SEPARATOR);
        }

        return this.name;
    }

    setCommand<S extends string>(command: MaybeArray<S>, description: string, ...middleware: Array<Middleware<C>>) {
        const newCommand = command instanceof Array
            ? [this.getModuleName(), command[0]].join(Module.MODULE_SEPARATOR)
            : [this.getModuleName(), command].join(Module.MODULE_SEPARATOR);

        Module.COMMANDS.push({ command: newCommand, description })

        return this.command(newCommand, ...middleware);
    }

    addSubmodule(submodule: Module<C>) {
        submodule.setParent(this);
        this.use(submodule);
        return submodule;
    }

    private setParent(parent: Module<C>) {
        this.parent = parent;
    }
}
