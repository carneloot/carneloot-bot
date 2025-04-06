import { utcToZonedTime } from 'date-fns-tz';
import { Array as A, Console, Data, Effect, Option, flow } from 'effect';

import type Qty from 'js-quantities';

import type { Context } from '../../../common/types/context.js';
import { getUserDisplay } from '../../../common/utils/get-user-display.js';
import type { PetID } from '../../../lib/database/schema.js';
import { ConfigService } from '../../../lib/entities/config.js';
import { getPetByID, getPetCarers } from '../../../lib/entities/pet.js';
import type { User } from '../../../lib/entities/user.js';

class MissingPetError extends Data.TaggedError('MissingPetError') {}

export const sendAddedFoodNotification =
	({
		id,
		quantity,
		user,
		time
	}: {
		id: PetID;
		quantity: Qty;
		user: User;
		time?: Date;
	}) =>
	(ctx: Context) =>
		Effect.gen(function* () {
			const pet = yield* Effect.tryPromise(() =>
				getPetByID(id, { withOwner: true })
			).pipe(
				Effect.withSpan('getPetByID'),
				Effect.andThen(Option.fromNullable),
				Effect.catchTag('NoSuchElementException', () =>
					Effect.fail(new MissingPetError())
				)
			);

			const config = yield* ConfigService;

			const dayStart = yield* config.getConfig('pet', 'dayStart', id);

			const carers = yield* Effect.tryPromise(() => getPetCarers(id)).pipe(
				Effect.withSpan('getPetCarers'),
				Effect.catchAll(() =>
					Effect.zipRight(
						Console.warn('Error getting pet carers'),
						Effect.succeed([] as Awaited<ReturnType<typeof getPetCarers>>)
					)
				),
				Effect.andThen(
					flow(
						A.filter((carer) => carer.status === 'accepted'),
						A.map((v) => v.carer)
					)
				)
			);

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

			yield* Effect.all(
				usersToNotify.map((userToNotify) =>
					Effect.tryPromise({
						try: () =>
							ctx.api.sendMessage(userToNotify.telegramID, message, {
								disable_notification: true
							}),
						catch: (err) =>
							console.error(
								`Error sending notification to ${getUserDisplay(userToNotify)}`,
								err
							)
					}).pipe(Effect.withSpan('bot.api.sendMessage'))
				),
				{
					concurrency: 'unbounded',
					mode: 'either'
				}
			);
		}).pipe(Effect.withSpan('sendAddedFoodNotification'));
