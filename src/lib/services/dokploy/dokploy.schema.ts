import { Schema } from 'effect';

export namespace DokploySchema {
	export const Id = Schema.String.pipe(Schema.brand('DokployId'));
	export type Id = typeof Id.Type;

	export class Compose extends Schema.Class<Compose>('DokployCompose')({
		composeId: Id,
		name: Schema.String,
		appName: Schema.String,
		serverId: Id
	}) {}

	export class DokployError extends Schema.TaggedError<DokployError>(
		'DokployError'
	)('DokployError', {
		cause: Schema.Unknown
	}) {}

	class ContainerConfigHealth extends Schema.Class<ContainerConfigHealth>(
		'ContainerConfigHealth'
	)({
		Status: Schema.Literal('healthy', 'unhealthy', 'starting'),
		FailingStreak: Schema.Number,
		Log: Schema.Array(
			Schema.Struct({
				Start: Schema.DateTimeUtc,
				End: Schema.DateTimeUtc,
				ExitCode: Schema.Number,
				Output: Schema.String
			})
		)
	}) {}

	const ContainerConfigState = Schema.Struct({
		Running: Schema.Boolean,
		Paused: Schema.Boolean,
		Restarting: Schema.Boolean,
		OOMKilled: Schema.Boolean,
		Dead: Schema.Boolean,
		Pid: Schema.Number,
		ExitCode: Schema.Number,
		Error: Schema.String,
		StartedAt: Schema.DateTimeUtc,
		FinishedAt: Schema.DateTimeUtc,
		Status: Schema.Literal('running', 'exited'),
		Health: ContainerConfigHealth
	});

	export class ContainerConfig extends Schema.Class<ContainerConfig>(
		'ContainerConfig'
	)({
		Id: Id,
		State: ContainerConfigState
	}) {}

	export const ContainerStatus = ContainerConfigState.fields.Status;

	export class Container extends Schema.Class<Container>('Container')({
		containerId: Id,
		name: Schema.String,
		image: Schema.String,
		ports: Schema.String,
		state: ContainerStatus,
		status: Schema.String,
		serverId: Id
	}) {}
}
