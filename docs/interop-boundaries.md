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
