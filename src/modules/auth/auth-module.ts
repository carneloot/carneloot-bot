import { Module } from '../../common/module/module.js';
import type { Context } from '../../common/types/context.js';
import { UserMiddleware } from '../../middlewares/user.middleware.js';
import {
	GenerateApiKeyCommand,
	apiKeyConfirmationMenu
} from './generate-api-key.command.js';
import { SignupCommand } from './signup.command.js';

export const AuthModule = new Module<Context>('', 'Operações de autenticação');

AuthModule.setCommand(
	'cadastrar',
	'Cadastra a sua conta no banco de dados',
	SignupCommand
);

AuthModule.use(UserMiddleware, apiKeyConfirmationMenu);
AuthModule.setCommand(
	'gerar_chave',
	'Gera uma nova api-key para o usuario',
	UserMiddleware,
	GenerateApiKeyCommand
);
