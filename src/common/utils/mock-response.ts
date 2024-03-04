import { sleep } from './sleep.js';

export const mockResponse = <T>(data: T, delay: number) => sleep(delay).then(() => ({ data }));
