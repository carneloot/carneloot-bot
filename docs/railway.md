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

For webhook mode, set `WEBHOOK_URL` to the public hostname without a scheme or
path. At startup, the webhook layer generates a 256-bit random secret and stores
it under `telegram:webhook-secret:<bot-id>` in Redis with `SET NX` and no expiry.
Concurrent instances and restarts reuse the stored secret. No separate secret
environment variable is required.

When `WEBHOOK_URL` is configured, startup registers
`https://<hostname>/api/webhook` and the bot commands with Telegram. Registration
passes the stored secret as Telegram's `secret_token`; Telegram sends it in the
`X-Telegram-Bot-Api-Secret-Token` header with each update. The bot rejects missing
or incorrect headers with `401`. The old secret-in-path endpoint is not served.
`GET /api/set-webhook` remains available to repeat registration with the same
secret, but no manual call is needed after deployment.

Webhook startup fails if Redis is unavailable, the stored secret is invalid,
or automatic registration fails. Without `WEBHOOK_URL`, automatic registration
is skipped and the registration endpoint returns `400`.

Keep the Redis key across deployments. Do not expire, evict, or delete it while
instances are running. Retaining it across Redis restarts requires Redis
persistence. If Redis loses the key, the next application start generates and
registers a replacement, which no longer matches secrets cached by older
instances. Polling mode does not create or register a webhook secret.

Run `bunx alchemy plan --stage production` to review infrastructure changes
without applying them.

The deploy workflow runs on pushes to `main` only when an application build or
Railway configuration input changes: `src/`, `public/`, `package.json`,
`bun.lock`, the Dockerfile/build context rules, the Alchemy stack, production
Fnox configuration. Documentation and workflow-only changes do not build or
deploy the service. When the workflow runs, Alchemy hashes the complete local
Docker build context and queues a Railway build only when that hash differs from
the persisted stack state. A manual workflow run always remains available.

## Custom domain and Cloudflare DNS

The stack attaches `bot.carneloot.com` to the Railway bot service on port 3000.
Alchemy publishes Railway's routing and verification records in the existing
Cloudflare zone `carneloot.com`. These records are DNS-only, with Cloudflare
proxying disabled so Railway can verify the domain and issue its TLS certificate.

Add these zone permissions to the `CLOUDFLARE_API_TOKEN` stored in 1Password:

- **Zone > Zone > Read**, to find the zone by name.
- **Zone > DNS > Edit**, to read, create, update, and delete the managed records.

Scope both permissions to the `carneloot.com` zone. Keep the account permissions
required by the [Cloudflare state store](#cloudflare-state-store).
The same token manages deployment state and DNS.

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

## Daily database backups to R2

Alchemy creates a private `DatabaseBackups` R2 bucket and an account API token
with object-read and object-write permissions scoped to that bucket. Listing
is required for retention cleanup. The stack derives the S3
secret with Effect's SHA-256 implementation and injects the credentials into
the bot service. No R2 credentials need to be copied into 1Password.

Before deploying, grant **Workers R2 Storage Write** and **API Tokens Write**
account permissions to the deployer's Cloudflare token for the
configured account. Keep its existing state-store and DNS permissions. The
runtime token cannot administer buckets or access other buckets.

The daily Effect job runs inside the Railway bot service, which owns the
database volume. It is not a second Railway cron service. A second service
would not have the bot's mounted database. The existing database volume,
custom domain, and DNS records remain unchanged.

`bun run start`, including the Docker entrypoint used by Railway, runs
`db:prepare` before loading the application. Preparation uploads a backup of
the existing database, cleans up expired backups, then synchronizes the
schema. If any step fails,
the command exits nonzero without starting the bot, workers, or HTTP server.
The existing refusal to apply a schema change that loses data still applies.

On a first deployment, preparation skips the backup only when the database
file does not exist and its parent directory exists. It then creates the
schema. A missing parent directory, unreadable database, or failed upload
blocks startup. With `DATABASE_BACKUP_ENABLED=false`, preparation runs the
schema synchronization without a backup.

This sequence runs on every service restart, not just new deployments. R2
must be available before an existing database can be migrated and the bot
can start. Allow enough time in Railway's deployment healthcheck for the
backup and schema synchronization. Do not configure these commands as a
Railway pre-deploy hook, because that container does not mount the volume.
Use `bun run start` rather than invoking `src/main.ts` directly, which skips
database preparation.

The stack sets these variables:

| Variable                      | Value                                       |
| ----------------------------- | ------------------------------------------- |
| `DATABASE_BACKUP_ENABLED`     | `true`, disabled by default outside Alchemy |
| `DATABASE_BACKUP_CRON`        | `0 3 * * *`, evaluated in UTC               |
| `R2_BACKUP_BUCKET`            | Generated bucket name                       |
| `R2_BACKUP_ENDPOINT`          | Account's R2 S3 endpoint                    |
| `R2_BACKUP_ACCESS_KEY_ID`     | Bucket-scoped token ID                      |
| `R2_BACKUP_SECRET_ACCESS_KEY` | Redacted SHA-256 of the token value         |

At 03:00 UTC, `DatabaseBackup` creates a consistent SQLite snapshot with
`VACUUM INTO`. The snapshot includes committed WAL data without copying the
live database file or its WAL separately. The job uploads the snapshot under
`sqlite/daily/<UTC timestamp>-<unique suffix>.sqlite`, then removes the temporary
directory on success or failure. Allow ephemeral disk space for a complete
database snapshot. Snapshot creation uses local SQLite and can briefly delay
the bot's event loop on large databases.

After preparation, the daily scheduler waits for the next deadline. It does
not repeat the startup backup or catch up for deadlines missed while the
service was stopped. Scheduled jobs run serially. A failed scheduled backup
logs `Database backup failed` and its operation, then the schedule continues
at the next deadline. Alert on that message and on the absence of a daily
`Database backup uploaded` message.

Daily and manual backups use the `sqlite/daily/` prefix. Startup backups use
`sqlite/pre-deploy/`. Daily backups retain seven days of snapshots. Startup
backups retain the newest seven snapshots, regardless of age. Both policies
use R2's object modification time to determine age or order.
Extra deployments therefore do not shorten the daily backup history.

After each successful upload, the job lists all pages under `sqlite/` and
deletes daily `.sqlite` objects whose age is at least seven days, plus startup
snapshots beyond the newest seven. Objects without valid modification times
and unrelated keys are retained. If the upload fails, cleanup does not run.
A cleanup failure fails that run and blocks startup when preparation is running.
Backups beyond either retention limit can remain while the service is down
or uploads fail.

The bucket itself is retained if Alchemy removes the resource, and
`forceDestroy` remains disabled. These snapshots cover SQLite only, not
Redis conversation state or queue data.

### Run a backup manually

Inside the deployed bot container, run:

```sh copy Copy Backup Command
bun run db:backup
```

The script reads only `DATABASE_URL` and the four `R2_BACKUP_*` variables. It
does not start the bot, Redis, schema synchronization, or HTTP server. A failed
snapshot or upload exits nonzero. Use an existing absolute `file:` database
URL. Remote and in-memory databases are not supported by this script.

### Restore a snapshot

1. Download the desired `.sqlite` object from the private R2 bucket using the
   Cloudflare dashboard or separate read-authorized credentials.
2. Validate the downloaded file with `sqlite3 <downloaded.sqlite> 'PRAGMA integrity_check; PRAGMA foreign_key_check;'`.
   Expect `ok` and no foreign-key violations.
3. Stop the bot before replacing any volume files. Preserve the existing
   `carneloot.db`, `carneloot.db-wal`, and `carneloot.db-shm` together as a
   rollback copy when those files exist.
4. Upload the snapshot as `/data/carneloot.db`. Do not leave the old WAL or SHM
   beside the restored database. A `VACUUM INTO` snapshot is self-contained.
5. Restart the bot, verify `/api/readyz`, and check representative application
   records before discarding the rollback copy.
