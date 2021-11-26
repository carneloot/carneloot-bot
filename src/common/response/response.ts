import { MaybeFunction } from '../types/maybe-function';

export type AnimationResponse = {
    type: 'animation',
    input: MaybeFunction<string>,
    caption?: MaybeFunction<string | undefined>,
};

export type ImageResponse = {
    type: 'image',
    input: MaybeFunction<string>,
    caption?: MaybeFunction<string | undefined>,
};

export type TextResponse = {
    type: 'text',
    text: MaybeFunction<string>,
};

export type UserResponse = AnimationResponse
    | ImageResponse
    | TextResponse;
