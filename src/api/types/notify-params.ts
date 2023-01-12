import { z } from 'zod';

export const NotifyType = z.enum([ 'PhoneBattery', 'WatchBattery' ]);
export type NotifyType = z.infer<typeof NotifyType>;

export const NotifyParams = z.object({
    secret: z.string(),
    notifyType: NotifyType,
});

export type NotifyParams = z.infer<typeof NotifyParams>;
