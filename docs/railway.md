# Railway deployment

`alchemy.run.ts` creates one Railway project with the bot built from the
repository's `Dockerfile`, a private Redis service, and a single volume mounted
at `/data`. The bot database is stored at `/data/carneloot.db`.

Alchemy keeps deployment state in `.alchemy/`, which is local and intentionally
not committed. Configure a Railway account or workspace token as
`RAILWAY_API_TOKEN` before using the stack.

## Move the current Dokploy production database

Schedule a brief maintenance window and stop the Dokploy bot before the first
Railway deployment. Deploy the stack to provision the app, Redis, and mounted
volume:

```sh copy Copy Provision Railway
BOT_TOKEN=... RUN_MODE=webhook bunx alchemy deploy --stage production
```

Upload the SQLite file retrieved from the Dokploy volume to Railway. Keep its
destination name as `/carneloot.db`, which matches the configured
`file:/data/carneloot.db` database URL:

```sh copy Copy Database Upload
railway link
railway volume files upload <path-to-current-production.db> /carneloot.db
```

`railway link` must target the project and production environment created by
Alchemy. The volume command prompts for the attached volume when there is more
than one.

Redeploy to restart the service against the populated volume:

```sh copy Copy Restart With Database
BOT_TOKEN=... RUN_MODE=polling bunx alchemy deploy --stage production
```

Verify the bot starts and handles a request before retiring the Dokploy database.
Keep the Dokploy database as a rollback copy until the Railway bot is verified.

## Application configuration

The stack reads the bot variables from the deployer's environment and writes
them as Railway service variables. `BOT_TOKEN` is required. `RUN_MODE` defaults
to `polling`; the other supported optional variables are:

- `WEBHOOK_URL`, `DEBUG`
- `TELEGRAM_FORWARD_USERNAMES`, `OWNER_TELEGRAM_ID`
- `SOURCE_COMMIT`
- `OTLP_URL`, `OTLP_API_TOKEN`, `OTLP_DATASET`

Run `bunx alchemy plan --stage production` to review infrastructure changes
without applying them.
