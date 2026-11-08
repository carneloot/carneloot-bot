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

## Run mode and rollout requirements

Deploy one application process for either `RUN_MODE=polling` or
`RUN_MODE=webhook`. Do not scale polling horizontally with one bot token. For
multiple webhook processes, route updates for each chat to one process in FIFO
order. The bot only preserves chat ordering inside one process.

Railway uses `GET /api/readyz` as its deployment healthcheck and waits for a
`200` response before switching traffic to a new deployment. During a rollback,
keep Redis conversation prefixes and use an application release that can read
the active conversation storage version. Read [the operations runbook](runbook.md)
for shutdown, alerts, queue failures, retries, and corrupt conversation state.

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

The deploy workflow runs on pushes to `main` only when an application build or
Railway configuration input changes: `src/`, `public/`, `package.json`,
`bun.lock`, the Dockerfile/build context rules, the Alchemy stack, production
Fnox configuration, or the workflow itself. Documentation-only changes do not
build or deploy the service. A manual workflow run always remains available.

## GitHub Actions deployment

The `Deploy` workflow deploys eligible pushes to `main` and can be run manually
from the Actions tab on any branch that contains the workflow. Manual runs offer
an `adopt` option for importing existing Railway resources into a fresh state
store and a `plan` option that previews changes without applying them. It uses
the GitHub `production` environment, so configure the following environment
secrets before its first run:

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
