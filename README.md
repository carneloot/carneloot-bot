# carneloot-bot

Telegram bot built with Bun, Effect, grammY, Redis, and LibSQL.

Run the checks before you change the bot:

```sh
bun run build:dev
bun run lint
bun run format
bun run test
```

Set the required variables from `.env.sample`, then start the bot with `bun run start`.
The HTTP server exposes `GET /api/healthz` for liveness and `GET /api/readyz` for dependency readiness.
Read [the operations runbook](docs/runbook.md) before deploying or changing the run mode.
Railway-specific instructions are in [the Railway deployment guide](docs/railway.md).
