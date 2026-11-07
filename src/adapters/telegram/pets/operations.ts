import { Effect, Option, Schema } from 'effect';

import type {
	PetCarerID,
	PetID,
	UserID,
} from '../../../lib/database/schema.js';
import { PetRepository } from '../../../lib/repositories/pet.js';
import { UserRepository } from '../../../lib/repositories/user.js';

export const UserDto = Schema.Struct({
	id: Schema.String,
	telegramID: Schema.String,
	username: Schema.NullOr(Schema.String),
	firstName: Schema.String,
	lastName: Schema.NullOr(Schema.String),
});

export const PetDto = Schema.Struct({ id: Schema.String, name: Schema.String });
export const CaredPetDto = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	ownerID: Schema.String,
});
export const PetCarerDto = Schema.Struct({
	id: Schema.String,
	status: Schema.Literals(['pending', 'accepted', 'rejected']),
	carer: UserDto,
});
export const PendingPetInviteDto = Schema.Struct({
	id: Schema.String,
	petName: Schema.String,
	petOwner: UserDto,
});

export const getUserOwnedPets = (userID: string) =>
	PetRepository.pipe(
		Effect.andThen((pets) => pets.getUserOwnedPets(userID as UserID)),
	);

export const getUserCaredPets = (userID: string) =>
	PetRepository.pipe(
		Effect.andThen((pets) => pets.getUserCaredPets(userID as UserID)),
	);

export const createPet = (name: string, ownerID: string) =>
	PetRepository.pipe(
		Effect.andThen((pets) => pets.createPet(name, ownerID as UserID)),
		Effect.as(null),
	);

export const deletePet = (petID: string) =>
	PetRepository.pipe(
		Effect.andThen((pets) => pets.deletePet(petID as PetID)),
		Effect.as(null),
	);

export const getPetCarers = (petID: string) =>
	PetRepository.pipe(
		Effect.andThen((pets) => pets.getPetCarers(petID as PetID)),
	);

export const getPetCarerStatus = (petID: string, carerID: string) =>
	PetRepository.pipe(
		Effect.andThen((pets) =>
			pets.getPetCarerStatus({
				petID: petID as PetID,
				carerID: carerID as UserID,
			}),
		),
		Effect.map((carer) => carer?.status ?? null),
	);

export const addCarer = (petID: string, carerID: string) =>
	PetRepository.pipe(
		Effect.andThen((pets) => pets.addCarer(petID as PetID, carerID as UserID)),
		Effect.as(null),
	);

export const removeCarer = (petID: string, carerID: string) =>
	PetRepository.pipe(
		Effect.andThen((pets) =>
			pets.removeCarer({ petID: petID as PetID, carerID: carerID as UserID }),
		),
		Effect.as(null),
	);

export const getPendingPetInvites = (carerID: string) =>
	PetRepository.pipe(
		Effect.andThen((pets) => pets.getPendingPetInvites(carerID as UserID)),
	);

export const answerPendingPetInvite = (
	inviteID: string,
	status: 'accepted' | 'rejected',
) =>
	PetRepository.pipe(
		Effect.andThen((pets) =>
			pets.answerPendingPetInvite({ inviteID: inviteID as PetCarerID, status }),
		),
		Effect.as(null),
	);

export const getUserByUsername = (username: string) =>
	UserRepository.pipe(
		Effect.andThen((users) => users.getUserByUsername(username)),
		Effect.map(Option.getOrNull),
	);

export const getUserByID = (userID: string) =>
	UserRepository.pipe(
		Effect.andThen((users) => users.getUserByID(userID as UserID)),
		Effect.map(Option.getOrNull),
	);
