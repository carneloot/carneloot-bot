import { z } from 'zod';

export const NotifyParams = z.object({
	apiKey: z.string(),
	keyword: z.string(),
	variables: z.record(z.string(), z.union([z.string(), z.number()])).optional()
});

export type NotifyParams = z.infer<typeof NotifyParams>;
