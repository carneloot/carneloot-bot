import { Effect } from "effect";

import { Context } from "../../common/types/context.js";
import { runtime } from "../../runtime.js";
import { Env } from "../../common/env.js";
import { StartServerWorkflow } from "./workflows/start-server.workflow.js";
import invariant from "tiny-invariant";

export const StartServerCommand = (ctx: Context) =>
	Effect.gen(function* () {
		const user = ctx.user;

		if (!user) {
			yield* Effect.tryPromise(() => ctx.reply("Por favor cadastre-se primeiro utilizando /cadastrar")).pipe(
				Effect.withSpan("ctx.reply"),
			);
			return;
		}

		if (user.telegramID !== Env.OWNER_TELEGRAM_ID) {
			yield* Effect.tryPromise(() => ctx.reply("Você não tem autorização para rodar esse comando")).pipe(
				Effect.withSpan("ctx.reply"),
			);
			return;
		}

		invariant(ctx.chatId, "Chat id must be defined");

		const message = yield* Effect.tryPromise(() => ctx.reply("Iniciando servidor...")).pipe(Effect.withSpan("ctx.reply"));

		yield* StartServerWorkflow.execute({
			messageId: message.message_id,
			chatId: ctx.chatId,
			userId: user.id,
		});
	}).pipe(Effect.withSpan("minecraft.StartServer"), runtime.runPromise);
