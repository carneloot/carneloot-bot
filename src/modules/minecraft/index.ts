import { Module } from '../../common/module/module';
import { AuthMiddleware } from '../../middlewares/auth.middleware';

import { StartServerCommand } from './start-server.command';
import { StopServerCommand } from './stop-server.command';
import { LoggerMiddleware } from '../../middlewares/logger.middleware';

const {
    MINECRAFT_AUTHORIZED_USERS,
    MINECRAFT_SERVER_URL,
    ADMIN_USER_ID
} = process.env;

export const MinecraftModule = new Module(
    'minecraft',
    'Controla o server de minecraft'
);

const Auth = AuthMiddleware(MINECRAFT_AUTHORIZED_USERS?.split(',') ?? [])
const Logger = LoggerMiddleware([Number(ADMIN_USER_ID!)]);

MinecraftModule.setCommand('server', 'Informa a url do server', Auth, ctx => ctx.reply(MINECRAFT_SERVER_URL!));
MinecraftModule.setCommand('start', 'Inicia o server de minecraft', Auth, Logger, StartServerCommand);
MinecraftModule.setCommand('stop', 'Para o server de minecraft', Auth, Logger, StopServerCommand);
