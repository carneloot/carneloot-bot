import type { User as TelegramUser } from '@grammyjs/types';

import { GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import randomstring from 'randomstring';

import { getSpreadsheet } from './sheets';
import { hashString } from '../common/utils/hash-string';

type User = {
	id: number;
	telegramID: number;
	username: string;
	firstName: string;
	lastName: string;
	apiKey?: string;
};

type GetUserRowCompareFn = (row: GoogleSpreadsheetRow<User>) => boolean;

let __sheet: GoogleSpreadsheetWorksheet;

const getUserSheet = async () => {
	if (!__sheet) {
		const spreadsheet = await getSpreadsheet();
		__sheet = spreadsheet.sheetsByTitle['users'];

		await __sheet.setHeaderRow([
			'id',
			'telegramID',
			'username',
			'firstName',
			'lastName',
			'apiKey'
		]);
	}
	return __sheet;
};

const createUser = async (user: TelegramUser) => {
	const foundUser = await getUserByTelegramID(user.id);

	if (foundUser) {
		return; // TODO: throw error
	}

	const sheet = await getUserSheet();

	const row = await sheet.addRow({
		telegramID: user.id,
		username: user.username!,
		firstName: user.first_name,
		lastName: user.last_name ?? ''
	});

	row.set('id', row.rowNumber);
	await row.save();
};

const getUserRow = async (fn: GetUserRowCompareFn) => {
	const sheet = await getUserSheet();
	const rows = await sheet.getRows<User>();
	return rows.find(fn);
};

const compareTelegramId =
	(telegramId: User['telegramID']): GetUserRowCompareFn =>
	(row) =>
		parseInt(row.get('telegramID'), 10) === telegramId;

const getUserByTelegramID = async (telegramID: User['telegramID']) => {
	const row = await getUserRow(compareTelegramId(telegramID));
	return row?.toObject();
};

const generateApiKeyForUser = async (telegramID: User['telegramID']) => {
	const apiKey = randomstring.generate();
	const hashedApiKey = hashString(apiKey);

	const row = await getUserRow(compareTelegramId(telegramID));

	if (!row) {
		throw new Error('User not found');
	}

	row.set('apiKey', hashedApiKey);
	await row.save();

	return apiKey;
};

const getUserFromApiKey = async (apiKey: string) => {
	const hashedApiKey = hashString(apiKey);
	const row = await getUserRow((row) => row.get('apiKey') === hashedApiKey);
	return row?.toObject();
};

const getUserById = async (id: number) => {
	const sheet = await getUserSheet();

	const [row] = await sheet.getRows<User>({ limit: 1, offset: id - 2 });

	return row?.toObject();
};

export { createUser, getUserByTelegramID, generateApiKeyForUser, getUserFromApiKey, getUserById };
