import { utcToZonedTime } from 'date-fns-tz';
import { Data, Effect } from 'effect';
import type Qty from 'js-quantities';

import type { Context } from '../../../common/types/context.js';
import { getUserDisplay } from '../../../common/utils/get-user-display.js';
import type { PetID } from '../../../lib/database/schema.js';
import { ConfigService } from '../../../lib/entities/config.js';
import { PetRepository } from '../../../lib/repositories/pet.js';
import type { User } from '../../../lib/repositories/user.js';

class MissingPetError extends Data.TaggedError('MissingPetError') {}

type AddedFood = {
	id: PetID;
	quantity: Qty;
	time?: Date;
};

export const sendAddedFoodNotifications =
	({
		foods,
		user,
		grouped = true,
	}: {
		foods: AddedFood[];
		user: User;
		grouped?: boolean;
	}) =>
	(ctx: Context) =>
		Effect.gen(function* () {
			const petRepository = yield* PetRepository;
			const config = yield* ConfigService;
			const username = getUserDisplay(user);

			const prepared = yield* Effect.forEach(
				foods,
				Effect.fn('sendAddedFoodNotifications.prepare')(function* ({
					id,
					quantity,
					time,
				}) {
					const pet = yield* petRepository.getPetByIDWithOwner(id).pipe(
						Effect.flatMap(Effect.fromOption),
						Effect.catchTag('NoSuchElementError', () =>
							Effect.fail(new MissingPetError()),
						),
					);

					const dayStart = yield* config.getConfig('pet', 'dayStart', id);

					const carers = yield* petRepository.getPetCarers(id).pipe(
						Effect.tapError((error) =>
							Effect.logWarning('Error getting pet carers', error),
						),
						Effect.orElseSucceed(() => []),
						Effect.map((carers) =>
							carers
								.filter((carer) => carer.status === 'accepted')
								.map((carer) => carer.carer),
						),
					);

					const usersToNotify = [...carers, pet.owner].filter(
						(carer) => carer.id !== user.id,
					);

					const formattedTime =
						time &&
						utcToZonedTime(time, dayStart.timezone).toLocaleString('pt-BR');

					const message = [
						grouped
							? `• ${pet.name}: ${quantity}`
							: `${username} colocou ${quantity} de ração para o pet ${pet.name}.`,
						formattedTime &&
							(grouped
								? `às ${formattedTime}`
								: `A ração foi adicionada às ${formattedTime}`),
					]
						.filter(Boolean)
						.join(' ');

					return { usersToNotify, message };
				}),
				{ concurrency: 'unbounded' },
			);

			const notifications = new Map<
				User['id'],
				{ user: User; messages: string[] }
			>();
			for (const { usersToNotify, message } of prepared) {
				for (const recipient of usersToNotify) {
					let notification = notifications.get(recipient.id);
					if (!notification) {
						notification = { user: recipient, messages: [] };
						notifications.set(recipient.id, notification);
					}
					notification.messages.push(message);
				}
			}

			yield* Effect.forEach(
				notifications.values(),
				({ user: userToNotify, messages }) =>
					Effect.tryPromise({
						try: () =>
							ctx.api.sendMessage(
								userToNotify.telegramID,
								(grouped
									? [`${username} colocou ração para os pets:`, ...messages]
									: messages
								).join('\n'),
								{
									disable_notification: true,
								},
							),
						catch: (error) => error,
					}).pipe(
						Effect.tapError((error) =>
							Effect.logError(
								`Error sending notification to ${getUserDisplay(userToNotify)}`,
								error,
							),
						),
						Effect.ignore,
					),
				{
					concurrency: 'unbounded',
					discard: true,
				},
			);
		}).pipe(Effect.withSpan('sendAddedFoodNotifications'));

export const sendAddedFoodNotification = ({
	user,
	...food
}: AddedFood & { user: User }) =>
	sendAddedFoodNotifications({ foods: [food], user, grouped: false });
