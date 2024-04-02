import { errAsync, okAsync } from 'neverthrow';

import Qty from 'js-quantities';

import { Context } from '../../../common/types/context';
import { PetID } from '../../../lib/database/schema';
import { getPetByID } from '../../../lib/entities/pet';
import { User } from '../../../lib/entities/user';
import { getUserDisplay } from '../../../common/utils/get-user-display';

export const sendOwnerNotification = async (ctx: Context, id: PetID, quantity: Qty, user: User) => {
	const pet = await getPetByID(id, { withOwner: true });
	if (!pet) {
		return errAsync('Pet não encontrado');
	}

	if (pet.owner.id === user.id) {
		return errAsync('Usuário é dono (a) do pet');
	}

	const username = getUserDisplay(user);
	const message = `${username} colocou ${quantity} de ração para o pet ${pet.name}.`;

	await ctx.api.sendMessage(pet.owner.telegramID, message, {
		disable_notification: true
	});

	return okAsync(null);
};
