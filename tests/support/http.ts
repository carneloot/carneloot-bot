import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { afterEach } from 'vitest';

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
	await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

export const createTestHttp = <A, E>(
	layer: Layer.Layer<
		A,
		E,
		| HttpRouter.HttpRouter
		| Layer.Success<typeof NodeHttpServer.layerHttpServices>
	>,
) => {
	const app = HttpRouter.toWebHandler(
		layer.pipe(Layer.provide(NodeHttpServer.layerHttpServices)),
		{ disableLogger: true },
	);
	disposers.push(app.dispose);
	return {
		request: (path: string, init?: RequestInit) =>
			app.handler(new Request(new URL(path, 'http://localhost').href, init)),
	};
};
