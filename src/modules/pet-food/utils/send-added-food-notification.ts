import { errAsync, okAsync } from 'neverthrow';

import type Qty from 'js-quantities';

import type { Context } from '../../../common/types/context.js';
import { getUserDisplay } from '../../../common/utils/get-user-display.js';
import type { PetID } from '../../../lib/database/schema.js';
import { getPetByID, getPetCarers } from '../../../lib/entities/pet.js';
import type { User } from '../../../lib/entities/user.js';

export const sendAddedFoodNotification = async (
	ctx: Context,
	id: PetID,
	quantity: Qty,
	user: User
) => {
	const pet = await getPetByID(id, { withOwner: true });
	if (!pet) {
		return errAsync('Pet não encontrado');
	}

	const carers = (await getPetCarers(id))
		.filter(({ status }) => status === 'accepted')
		.map(({ carer }) => carer);

	const usersToNotify = [...carers, pet.owner].filter(
		(carer) => carer.id !== user.id
	);

	const username = getUserDisplay(user);
	const message = `${username} colocou ${quantity} de ração para o pet ${pet.name}.`;

	for (const userToNotify of usersToNotify) {
		await ctx.api.sendMessage(userToNotify.telegramID, message, {
			disable_notification: true
		});
	}

	return okAsync(null);
};
