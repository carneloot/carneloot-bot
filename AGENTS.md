# Agent Guide for carneloot-bot

This repository is a Bun + TypeScript Telegram bot that leans heavily on the
Effect ecosystem, Hono for HTTP, and Drizzle for persistence. Follow the
conventions below when making changes.

## Quick facts

- Runtime: Bun, ESM modules (`"type": "module"`).
- TypeScript: `strict`, `noEmit`, `isolatedModules`, `noUncheckedIndexedAccess`.
- Effects: prefer `Effect.gen`/`Effect.fn` and tagged errors.
- Formatting/linting: Biome (tabs, single quotes, no trailing commas).
- Tests: Vitest (some tests use `@effect/vitest`).

## Build, lint, test commands

- Install deps: `bun install` (lockfile is `bun.lock`).
- Dev server: `bun run dev` (nodemon watches `src/*`).
- Start app: `bun run start` (runs `src/index.ts`).
- Build/check types: `bun run build:dev` (tsc, no emit).
- Tests: `bun run test` (TZ=UTC, Vitest).

## Run a single test

- By file: `bun run test -- src/common/utils/get-relative-time.test.ts`.
- By name: `bun run test -- -t "parse pet food"`.
- Watch mode: `bun run test -- --watch`.

## Linting and formatting

- CI runs Biome: `biome ci .`.
- Local check: `bunx biome check .`.
- Local fix: `bunx biome check --write .`.

## Cursor/Copilot rules

- No `.cursor/rules`, `.cursorrules`, or `.github/copilot-instructions.md` found.

## Project layout

- `src/index.ts`: Hono HTTP entry, webhook/polling startup.
- `src/bot.ts`: bot wiring, middleware, modules, commands.
- `src/common`: shared types, env parsing, response helpers, errors.
- `src/lib`: data access, services, queues, entities.
- `src/modules`: feature modules, command handlers.
- `src/middlewares`: request, reply, error handling.

## Import style

- Use ESM import syntax with explicit `.js` extension for local files.
- Group imports: external packages, blank line, internal modules.
- Prefer `import type` for type-only imports.

Example:

```ts
import { Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';

import type { Context } from '../common/types/context.js';
import { runtime } from '../runtime.js';
```

## Formatting conventions (Biome)

- Tabs for indentation.
- Single quotes for JS/TS strings.
- No trailing commas.
- Keep lines readable; wrap long expressions thoughtfully.

## TypeScript conventions

- Keep `strict` typing intact; avoid `any` unless justified.
- Prefer precise types over broad unions.
- Use `Schema` from `effect` for runtime validation.
- Use `satisfies` for typed objects when possible.

## Naming conventions

- Files: kebab-case (e.g. `pet-food.module.ts`).
- Commands: `*.command.ts`, modules: `*.module.ts`.
- Tagged errors: `FooError` with `Data.TaggedError('FooError')`.
- Effect factories: `Effect.fn('Name')` for tracing.

## Effect usage patterns

- Use `Effect.gen(function* () { ... })` for sequential effects.
- Wrap handlers with `Effect.fn('name')` to label spans.
- Use `runtime.runPromise` at the boundary (HTTP handlers, middlewares).
- Prefer `Effect.catchTag`/`Effect.catchTags` for error mapping.

## Error handling

- Define domain errors as `Data.TaggedError`.
- Convert external errors in a `matchError` helper.
- In middleware, catch and respond rather than throwing.
- When logging, use `Effect.log*` helpers.

## Env and configuration

- Env is validated with `Schema.decodeUnknown` in `src/common/env.ts`.
- New env vars should be added to the schema and typed there.
- Use `Schema.Redacted` for secrets.

## Database and services

- DB uses Drizzle with LibSQL; see `src/lib/database/db.ts`.
- Queries are modeled as Effect services and composed with layers.
- Use `Database.execute` or `Database.transaction` helpers.

## Testing patterns

- Tests live alongside utils under `src/**` with `.test.ts` suffix.
- Use `@effect/vitest` when tests are effectful.
- Keep tests deterministic; TZ is forced to UTC.

## Hono/HTTP conventions

- Use `sValidator` for request validation.
- Prefer `Effect.catchTags` to map domain errors to JSON responses.
- Keep API routes under `/api`.

## Bot and module conventions

- Commands are exported as objects with `command` and handler.
- Modules register their commands with `Module.getCommandList()`.
- Favor middleware composition over nested handlers.

## Response helpers

- Use `sendResponse`/`send-random-response` helpers.
- For user-facing errors, respond with localized strings.

## Safe changes checklist

- Keep `.js` extensions in imports for ESM compatibility.
- Respect Biome formatting (tabs, quotes).
- Preserve Effect patterns and tagged errors.
- Avoid side effects outside `Effect` boundaries.

## Useful scripts reference

- `bun run db:push` (Drizzle migrate/push)
- `bun run db:studio` (Drizzle Studio)
- `bun run set-webhook` (requires `BOT_URL`)

## When adding new features

- Add tests for parsing/logic utilities.
- Add new commands in `src/modules/...` with a matching module export.
- Update help command descriptions via `getDescriptionForHelp`.
