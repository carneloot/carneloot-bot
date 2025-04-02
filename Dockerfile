FROM oven/bun:1.2.8 AS base
WORKDIR /usr/src/app

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
