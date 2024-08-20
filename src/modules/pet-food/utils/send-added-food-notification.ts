import { errAsync, okAsync } from 'neverthrow';

import type Qty from 'js-quantities';

import { utcToZonedTime } from 'date-fns-tz';
import type { Context } from '../../../common/types/context.js';
import { getUserDisplay } from '../../../common/utils/get-user-display.js';
import type { PetID } from '../../../lib/database/schema.js';
import { getConfig } from '../../../lib/entities/config.js';
import { getPetByID, getPetCarers } from '../../../lib/entities/pet.js';
import type { User } from '../../../lib/entities/user.js';

export const sendAddedFoodNotification = async (
	ctx: Context,
	{
		id,
		quantity,
		user,
		time
	}: {
		id: PetID;
		quantity: Qty;
		user: User;
		time?: Date;
	}
) => {
	const pet = await getPetByID(id, { withOwner: true });
	if (!pet) {
		return errAsync('Pet não encontrado');
	}

	const dayStart = await getConfig('pet', 'dayStart', id);

	if (!dayStart) {
		return errAsync('Horário de início do dia não configurado');
	}

	const carers = (await getPetCarers(id))
		.filter(({ status }) => status === 'accepted')
		.map(({ carer }) => carer);

	const usersToNotify = [...carers, pet.owner].filter(
		(carer) => carer.id !== user.id
	);

	const username = getUserDisplay(user);

	const message = [
		`${username} colocou ${quantity} de ração para o pet ${pet.name}.`,
		time &&
			`A ração foi adicionada às ${utcToZonedTime(
				time,
				dayStart.timezone
			).toLocaleString('pt-BR')}`
	]
		.filter(Boolean)
		.join(' ');

	for (const userToNotify of usersToNotify) {
		await ctx.api.sendMessage(userToNotify.telegramID, message, {
			disable_notification: true
		});
	}

	return okAsync(null);
};
