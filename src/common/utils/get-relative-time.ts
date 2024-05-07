import { formatDuration, intervalToDuration } from 'date-fns';

import ptBR from 'date-fns/locale/pt-BR/index.js';

type Unit = keyof Duration;

type Options = {
	units: Unit[];
};

export const getRelativeTime = (
	date: Date,
	baseDate: Date,
	options?: Options
) => {
	const duration = intervalToDuration({
		start: baseDate,
		end: date
	});

	const formattedDuration = formatDuration(duration, {
		locale: ptBR,
		format: options?.units ?? [],
		delimiter: ','
	}).split(',');

	return [
		formattedDuration.slice(0, formattedDuration.length - 1).join(', '),
		formattedDuration.at(-1)
	]
		.filter(Boolean)
		.join(' e ');
};
