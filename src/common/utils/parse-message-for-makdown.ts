export const parseMessageForMarkdown = (message: string) =>
	message
		.replaceAll('.', '\\.')
		.replaceAll('|', '\\|')
		.replaceAll('(', '\\(')
		.replaceAll(')', '\\)')
		.replaceAll('_', '\\_');
