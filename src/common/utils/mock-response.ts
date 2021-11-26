import { sleep } from './sleep';

export const mockResponse = <T>(data: T, delay: number) => sleep(delay).then(() => ({ data }));
