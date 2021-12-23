import { Module } from '../../common/module/module';
import { AddTimeCommand } from './add-time.command';
import { AuthMiddleware } from '../../middlewares/auth.middleware';

const { TIMESHEET_AUTHORIZED_USERS } = process.env;

export const TimesheetModule = new Module(
    'timesheet',
    'Timesheet operations'
);

const Auth = AuthMiddleware(TIMESHEET_AUTHORIZED_USERS?.split(',') ?? [])

TimesheetModule.setCommand('add', 'Adiciona o horario atual na timesheet', Auth, AddTimeCommand);
