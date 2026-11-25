# Operations runbook

## Check service health

Use `GET /api/healthz` to verify that the HTTP process is running. The endpoint does not contact dependencies.

Use `GET /api/readyz` before sending traffic to the process. It checks LibSQL, the Redis conversation store, the BullMQ queue, and Telegram `getMe`. It returns `200` with `{"status":"ready"}` only when all checks pass. It returns `503` with `{"status":"not-ready"}` when a dependency is unavailable. The response does not include credentials or dependency error details.

Alert when readiness stays non-200, when the process exits unexpectedly, or when queue jobs fail or remain delayed past their expected notification time. Use traces for `telegram.update`, `telegram.command`, `telegram.conversation.external`, `telegram.sendMessage`, and queue job spans to investigate the failing update, chat, command, storage version, or job. Do not add message text, API keys, bot tokens, Redis URLs, or database tokens to trace attributes or logs.

## Run one update consumer per conversation key

`RUN_MODE=polling` and `RUN_MODE=webhook` are mutually exclusive. Use one bot process in either mode unless the deployment routes every update for a chat to the same process in order. The in-process `sequentialize` middleware preserves FIFO order only for updates with the same chat ID in one process. It does not coordinate multiple processes. Updates without a chat ID are not serialized.

Do not run two polling processes with the same bot token. Telegram polling has one consumer. For a multi-process webhook deployment, use sticky routing by chat ID or an equivalent ordered, single-consumer update queue before the bot.

## Deploy and stop safely

1. Check `/api/readyz` on the new process before directing webhook traffic to it.
2. In polling mode, stop the old process before starting the new poller.
3. Send `SIGTERM` or `SIGINT` for shutdown. The application stops polling and closes the HTTP server, Redis clients, BullMQ workers, and database runtime through its Effect scope.
4. Keep the old release and its compatible conversation storage version until active conversations have completed or expired.

The notification queue retries failed jobs three times with exponential backoff. A job can run more than once after a worker failure, so notification handling must tolerate duplicate work. Telegram sends do not retry automatically because a timeout can occur after Telegram accepts the message. Retry a send manually only after checking whether the message was delivered.

## Handle conversation data and rollback

Conversation state uses the `conversation:v1:` Redis prefix and storage version `1`. A new storage version discards incompatible persisted conversation state. That protects replay correctness but ends the affected user flow. Monitor for new conversation starts after a version change and tell users to restart a cancelled flow with its command.

Do not delete older conversation prefixes during a rollout. A rollback is safe only while the older release can read the stored version. If a release writes a new conversation version, retain the previous release and Redis data until the rollback window closes. Restore the previous application release before routing updates back to it. Do not edit persisted conversation data by hand. Treat corrupt or version-dropped data as a cancelled flow, preserve the key for investigation, and ask the user to restart the command.

## Respond to queue failures

Investigate queue failures with the job ID, pet ID, and trace ID. Check Redis availability, BullMQ worker logs, and notification history before retrying a failed job. Do not enqueue a replacement job until you know whether the original job sent a notification. If delivery is uncertain, prefer a manual, user-visible recovery over an automatic duplicate send.
