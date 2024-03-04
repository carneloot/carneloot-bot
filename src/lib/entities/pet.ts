import { createId } from '@paralleldrive/cuid2';

import { and, eq } from 'drizzle-orm';

import { db } from '../database/db';
import { petCarersTable, PetCarerStatus, petsTable, usersTable } from '../database/schema';

export type Pet = typeof petsTable.$inferSelect;
export type PetCarer = typeof petCarersTable.$inferSelect;

export const createPet = async (name: Pet['name'], ownerID: Pet['ownerID']) => {
	await db.insert(petsTable).values({
		id: createId() as Pet['id'],
		name,
		ownerID
	});
};

export const deletePet = async (petID: Pet['id']) => {
	await db.delete(petsTable).where(eq(petsTable.id, petID));
};

export const getUserOwnedPets = (userID: Pet['ownerID']) => {
	return db
		.select({
			id: petsTable.id,
			name: petsTable.name
		})
		.from(petsTable)
		.where(eq(petsTable.ownerID, userID))
		.all();
};

export const getUserCaredPets = (userID: PetCarer['carerID']) => {
	return db
		.select({
			id: petsTable.id,
			name: petsTable.name,
			ownerID: petsTable.ownerID
		})
		.from(petCarersTable)
		.innerJoin(petsTable, eq(petCarersTable.petID, petsTable.id))
		.where(and(eq(petCarersTable.carerID, userID), eq(petCarersTable.status, 'accepted')))
		.all();
};

export const getPetCarers = (petID: PetCarer['petID']) => {
	return db
		.select({
			id: petCarersTable.id,
			status: petCarersTable.status,
			carer: usersTable
		})
		.from(petCarersTable)
		.innerJoin(usersTable, eq(petCarersTable.carerID, usersTable.id))
		.where(eq(petCarersTable.petID, petID))
		.all();
};

export const getPetFromNameAndOwner = (petName: Pet['name'], ownerID: Pet['ownerID']) => {
	return db
		.select()
		.from(petsTable)
		.where(and(eq(petsTable.name, petName), eq(petsTable.ownerID, ownerID)))
		.get();
};

export const isUserCarer = (petID: PetCarer['petID'], carerID: PetCarer['carerID']) => {
	return db
		.select()
		.from(petCarersTable)
		.where(and(eq(petCarersTable.carerID, carerID), eq(petCarersTable.petID, petID)))
		.get();
};

export const addCarer = async (petID: PetCarer['petID'], carerID: PetCarer['carerID']) => {
	await db.insert(petCarersTable).values({
		id: createId() as PetCarer['id'],
		carerID,
		petID
	});
};

export const removeCarer = async (petID: PetCarer['petID'], carerID: PetCarer['carerID']) => {
	await db
		.delete(petCarersTable)
		.where(and(eq(petCarersTable.carerID, carerID), eq(petCarersTable.petID, petID)));
};

export const getPendingPetInvites = async (carerID: PetCarer['carerID']) => {
	return db
		.select({
			id: petCarersTable.id,
			petName: petsTable.name,
			petOwner: petsTable.ownerID
		})
		.from(petCarersTable)
		.innerJoin(petsTable, eq(petCarersTable.petID, petsTable.id))
		.where(and(eq(petCarersTable.carerID, carerID), eq(petCarersTable.status, 'pending')))
		.all();
};

export const answerPendingPetInvite = async (
	inviteID: PetCarer['id'],
	answer: Exclude<PetCarerStatus, 'pending'>
) => {
	await db.update(petCarersTable).set({ status: answer }).where(eq(petCarersTable.id, inviteID));
};
