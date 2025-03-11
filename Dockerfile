FROM oven/bun:1.2.2 AS base
WORKDIR /usr/src/app

# Solved from: https://github.com/tursodatabase/libsql-client-ts/issues/221
RUN apt-get update && apt-get install -y ca-certificates

FROM base AS install

RUN mkdir -p /temp/prod

COPY package.json bun.lock /temp/prod/

RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS release

COPY --from=install /temp/prod/node_modules node_modules

COPY . .

ENV PORT=3000

EXPOSE 3000

USER bun

ENTRYPOINT [ "bun", "run", "start" ]
