export const reviveDate = (value: Date | string) =>
	typeof value === 'string' ? new Date(value) : value;
