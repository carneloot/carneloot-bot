import { z } from 'zod';

export const NotifyParams = z.object({
    apiKey: z.string(),
    keyword: z.string(),
});

export type NotifyParams = z.infer<typeof NotifyParams>;
