import { MaybeFunction } from '../types/maybe-function.js';

export type GifResponse = {
	type: 'gif';
	input: MaybeFunction<string>;
	caption?: MaybeFunction<string | undefined>;
};

export type ImageResponse = {
	type: 'image';
	input: MaybeFunction<string>;
	caption?: MaybeFunction<string | undefined>;
};

export type TextResponse = {
	type: 'text';
	text: MaybeFunction<string>;
};

export type UserResponse = GifResponse | ImageResponse | TextResponse;
