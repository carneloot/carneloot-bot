import { MiddlewareFn } from 'grammy';
import { DescribeInstancesCommand, StopInstancesCommand } from '@aws-sdk/client-ec2';
import { isDebug } from '../../common/utils/is-debug';
import { createEC2Client } from './ec2-client';

const { MINECRAFT_AWS_INSTANCE_ID } = process.env;

export const StopServerCommand: MiddlewareFn = async ctx => {
    const statusMessage = await ctx.reply('Processando...');

    const client = createEC2Client();
    const params = { InstanceIds: [ MINECRAFT_AWS_INSTANCE_ID! ], DryRun: isDebug() };

    const updateMessage = (msg: string) => ctx.api.editMessageText(
        statusMessage.chat.id,
        statusMessage.message_id,
        msg,
    );

    try {
        const described = await client.send(new DescribeInstancesCommand(params));
        const instance = described.Reservations?.[0].Instances?.[0];

        if (!instance || instance.State?.Name === 'stopped') {
            await updateMessage('O servidor não está rodando 😅');
            return;
        }

        await client.send(new StopInstancesCommand(params))

        await updateMessage('Servidor parado! 👌');
    } catch (err) {
        await updateMessage('Erro ao parar servidor 😢');

        await ctx.api.sendMessage(
            ctx.chat!.id!,
            `\`\`\` ${JSON.stringify(err, null, 2)} \`\`\``,
            {
                parse_mode: 'MarkdownV2',
            }
        );
    }

}
