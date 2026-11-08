import debug from 'debug';
import { Effect } from 'effect';

import type { AppServices } from '../../app/layer.js';
import type { Execute } from '../execute.js';

type DebugInstance = debug.Debugger;

const isGrammyDebug = (debugInstance: DebugInstance): boolean =>
	debugInstance.namespace.startsWith('grammy');

/**
 * Sends grammY's DEBUG output through the application Effect runtime.
 *
 * `debug` formats messages before invoking its global sink. Capturing the
 * arguments in `formatArgs` retains the original message and arguments while
 * leaving its namespace matching semantics untouched.
 */
export const installGrammyDebugLogger = (execute: Execute<AppServices>) => {
	const originalLog = debug.log;
	const originalFormatArgs = debug.formatArgs;
	const messages = new WeakMap<object, ReadonlyArray<unknown>>();

	debug.formatArgs = function (this: DebugInstance, args: unknown[]) {
		if (isGrammyDebug(this)) {
			messages.set(this, [...args]);
		}

		return originalFormatArgs.call(this, args);
	};

	debug.log = function (this: DebugInstance, ...args: unknown[]) {
		if (!isGrammyDebug(this)) {
			return originalLog.apply(this, args);
		}

		const message = messages.get(this) ?? args;
		messages.delete(this);
		void execute(
			Effect.logDebug(...message).pipe(
				Effect.annotateLogs({ 'debug.namespace': this.namespace }),
			),
		);
	};

	return () => {
		debug.log = originalLog;
		debug.formatArgs = originalFormatArgs;
	};
};
