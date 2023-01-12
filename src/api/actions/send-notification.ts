import { Bot } from 'grammy';
import { NotifyType } from '../types/notify-params';

const getNotificationMessage = (type: NotifyType): string => ({
    PhoneBattery: "O celular terminou de ser carregado!",
    WatchBattery: "O relógio terminou de ser carregado!",
} as Record<NotifyType, string>)[type]

export const sendNotification = async (bot: Bot, notifyType: NotifyType) => {
    const userId = Number(process.env.ADMIN_USER_ID)
    await bot.api.sendMessage(userId, getNotificationMessage(notifyType));
}
