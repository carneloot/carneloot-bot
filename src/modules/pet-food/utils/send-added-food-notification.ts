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

export const sendAddedFoodNotification =
	({
		id,
		quantity,
		user,
		time,
	}: {
		id: PetID;
		quantity: Qty;
		user: User;
		time?: Date;
	}) =>
	(ctx: Context) =>
		Effect.gen(function* () {
			const petRepository = yield* PetRepository;
			const pet = yield* petRepository.getPetByIDWithOwner(id).pipe(
				Effect.flatMap(Effect.fromOption),
				Effect.catchTag('NoSuchElementError', () =>
					Effect.fail(new MissingPetError()),
				),
			);

			const config = yield* ConfigService;

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

			const username = getUserDisplay(user);

			const message = [
				`${username} colocou ${quantity} de ração para o pet ${pet.name}.`,
				time &&
					`A ração foi adicionada às ${utcToZonedTime(
						time,
						dayStart.timezone,
					).toLocaleString('pt-BR')}`,
			]
				.filter(Boolean)
				.join(' ');

			yield* Effect.all(
				usersToNotify.map((userToNotify) =>
					Effect.tryPromise({
						try: () =>
							ctx.api.sendMessage(userToNotify.telegramID, message, {
								disable_notification: true,
							}),
						catch: (error) => error,
					}).pipe(
						Effect.tapError((error) =>
							Effect.logError(
								`Error sending notification to ${getUserDisplay(userToNotify)}`,
								error,
							),
						),
						Effect.withSpan('bot.api.sendMessage'),
					),
				),
				{
					concurrency: 'unbounded',
					mode: 'result',
				},
			);
		}).pipe(Effect.withSpan('sendAddedFoodNotification'));
