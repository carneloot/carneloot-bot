import { Module } from '../../common/module/module.js';
import { Context } from '../../common/types/context.js';
import { StartServerCommand } from './start-server.command.js';

export const MinecraftModule = new Module<Context>(
	'minecraft',
	'Opções de gerenciamento do servidor de minecraft'
);

MinecraftModule.setCommand(
	'start_server',
	'Inicia o server de minecraft',
	StartServerCommand
);
