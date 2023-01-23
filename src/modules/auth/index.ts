import { Module } from '../../common/module/module';
import { SignupCommand } from './signup.command';
import { GenerateApiKeyCommand, apiKeyConfirmationMenu } from './generate-api-key.command';

export const AuthModule = new Module(
    '',
    'Auth operations'
);

AuthModule.setCommand('signup', 'Signs up a new user to the database', SignupCommand);

AuthModule.use(apiKeyConfirmationMenu);
AuthModule.setCommand('generate_apikey', 'Generates a new ApiKey for the user', GenerateApiKeyCommand);
