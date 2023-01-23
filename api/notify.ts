import { VercelRequest, VercelResponse } from '@vercel/node';
import { NotifyParams } from '../src/api/types/notify-params';
import { createBot } from '../src/bot';
import { sendNotification } from '../src/api/actions/send-notification';

export default async (req: VercelRequest, res: VercelResponse) => {
    if (req.method !== 'POST') {
        return res
            .status(404)
            .json({ message: 'Not found' });
    }

    const parsedBodResult = NotifyParams.safeParse(req.body);
    if (!parsedBodResult.success) {
        return res
            .status(422)
            .json(parsedBodResult.error);
    }

    const { data: body } = parsedBodResult;

    const bot = createBot();

    await sendNotification(bot, body);

    res.json({ message: 'Notification sent successfully!' });
}
