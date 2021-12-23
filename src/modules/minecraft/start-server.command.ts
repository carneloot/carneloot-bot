import { MiddlewareFn } from 'grammy';
import { StartInstancesCommand } from '@aws-sdk/client-ec2';
import { isDebug } from '../../common/utils/is-debug';
import { createEC2Client } from './ec2-client';

const { MINECRAFT_AWS_INSTANCE_ID } = process.env;

export const StartServerCommand: MiddlewareFn = async ctx => {
    const statusMessage = await ctx.reply('Processando...');

    const updateMessage = (msg: string) => ctx.api.editMessageText(
        statusMessage.chat.id,
        statusMessage.message_id,
        msg,
    );

    const client = createEC2Client();

    try {
        await client.send(new StartInstancesCommand({ InstanceIds: [MINECRAFT_AWS_INSTANCE_ID!], DryRun: isDebug() }));

        await updateMessage('Servidor iniciado! 👌');
    } catch (err) {
        await updateMessage('Erro ao iniciar servidor 😢');

        await ctx.api.sendMessage(
            ctx.chat!.id!,
            `\`\`\` ${JSON.stringify(err, null, 2)} \`\`\``,
            {
                parse_mode: 'MarkdownV2',
            }
        );
    }

}
