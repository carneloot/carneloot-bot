import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

let __spreadsheet: GoogleSpreadsheet;

export async function getSpreadsheet() {
	if (!__spreadsheet) {
		if (!process.env.SPREADSHEET_ID) {
			throw new Error('Missing SPREADSHEET_ID');
		}

		const serviceAccountAuth = new JWT({
			email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
			key: process.env.GOOGLE_PRIVATE_KEY,
			scopes: ['https://www.googleapis.com/auth/spreadsheets']
		});

		__spreadsheet = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);
		await __spreadsheet.loadInfo();
	}
	return __spreadsheet;
}
