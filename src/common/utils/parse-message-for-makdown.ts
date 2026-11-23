export const parseMessageForMarkdown = (message: string) =>
	message.replaceAll(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
