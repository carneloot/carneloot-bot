# Foreign callback boundaries

The application owns one scoped Effect executor. Promise- and callback-based
adapters receive it through the `Execute` capability in
`src/adapters/execute.ts`. Legacy code still imports the shared runtime while
it is migrated; new adapter code must use `Execute` instead.

## Migration inventory

| Boundary                                  | Current locations                                                      | Target migration                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Telegram commands and middleware          | `src/commands/`, `src/middlewares/reply.middleware.ts`, `src/modules/` | Inject `Execute` through Telegram adapter construction.                                                 |
| Conversation builders and wait predicates | `src/modules/pet/`, `src/modules/pet-food/`                            | Use a schema-backed `conversation.external` adapter.                                                    |
| Hono route handlers                       | `src/adapters/http/server.ts`                                          | Inject `Execute` when building the HTTP adapter.                                                        |
| BullMQ worker callbacks                   | `src/lib/queues/pet-food-notification.ts`                              | Start the worker in the application scope and supply its executor there.                                |
| Drizzle transaction callback              | `src/lib/database/db.ts`                                               | Keep captured-context execution internal to the database adapter; remove the global runtime dependency. |

`Effect.runPromise`/`runtime.runPromise` use outside this inventory is a migration bug.

## Conversation persistence

Conversation data is stored under the `conversation:v1:` Redis prefix with
grammY storage version `1`. Updates from a chat are processed in FIFO order;
updates without a chat ID are not serialized, and sequencing is local to one
bot process. A multi-process webhook deployment must route every chat to one
ordered consumer. Two polling processes must not share a bot token.

The previous unversioned `session:` keys are intentionally left untouched by
this release. Before removing them, inspect their production TTLs and retain
them until active flows have expired or been cancelled. Increment the storage
version whenever a conversation change invalidates its replay state; grammY
will then discard incompatible state instead of replaying it against new code.
Keep old prefixes for the rollback window. Treat corrupt or version-dropped
state as a cancelled flow and ask the user to restart the command.
