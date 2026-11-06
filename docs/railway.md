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

## GitHub Actions deployment

The `Deploy` workflow deploys every push to `main` and can be run manually from
the Actions tab on any branch that contains the workflow. Manual runs offer an
`adopt` option for importing existing Railway resources into a fresh state
store. It uses the GitHub `production` environment, so configure the following
environment secrets before its first run:

- `OP_SERVICE_ACCOUNT_TOKEN`: a 1Password service-account token with read
  access to the `Secrets` vault and the `carneloot-bot` item, including its
  `RAILWAY_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`
  fields.

The workflow runs `fnox --profile production exec -- bunx alchemy deploy --stage
production`, which resolves the production profile's application configuration
and Railway token without writing their plaintext values to the repository.

## Cloudflare state store

Alchemy stores the Railway stack's state in Cloudflare rather than the local
`.alchemy/` directory. Before the first GitHub deployment, populate the
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` fields on the
`carneloot-bot` item in 1Password, then bootstrap the store from a trusted
machine:

```sh copy Copy Bootstrap State Store
fnox exec --profile production -- bunx alchemy state bootstrap
```

The Cloudflare API token must be able to create and update the state-store
Worker, Durable Object, and Secrets Store in the configured account. Keep the
existing `.alchemy/` directory as a backup until the first remote deployment
has completed successfully.
