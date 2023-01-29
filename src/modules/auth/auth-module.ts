import { Module } from '../../common/module/module';
import { SignupCommand } from './signup.command';
import { GenerateApiKeyCommand, apiKeyConfirmationMenu } from './generate-api-key.command';

export const AuthModule = new Module(
    '',
    'Operações de autenticação'
);

AuthModule.setCommand('cadastrar', 'Cadastra a sua conta no banco de dados', SignupCommand);

AuthModule.use(apiKeyConfirmationMenu);
AuthModule.setCommand('gerar_chave', 'Gera uma nova api-key para o usuario', GenerateApiKeyCommand);
