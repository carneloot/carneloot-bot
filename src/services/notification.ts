import { GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';

import { getSpreadsheet } from './sheets';

type Notification = {
	id: number;
	keyword: string;
	message: string;
	ownerId: number;
	/** ID Array */
	usersToNotify: string;
};

type GetNotificationCompareFunction = (row: GoogleSpreadsheetRow<Notification>) => boolean;

let __sheet: GoogleSpreadsheetWorksheet;

const getNotificationSheet = async () => {
	if (!__sheet) {
		const spreadsheet = await getSpreadsheet();
		__sheet = spreadsheet.sheetsByTitle['notifications'];
		await __sheet.setHeaderRow(['id', 'keyword', 'message', 'ownerId', 'usersToNotify']);
	}
	return __sheet;
};

const getNotificationRow = async (fn: GetNotificationCompareFunction) => {
	const sheet = await getNotificationSheet();

	const rows = await sheet.getRows<Notification>();
	return rows.find(fn);
};

const getNotificationByOwnerAndKeyword = async (
	ownerId: Notification['ownerId'],
	keyword: Notification['keyword']
) => {
	const row = await getNotificationRow(
		(row) => row.get('ownerId') === ownerId && row.get('keyword') === keyword
	);

	return row?.toObject() as Notification;
};

export { getNotificationByOwnerAndKeyword };
