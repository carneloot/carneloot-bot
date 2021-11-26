export type AnimationResponse = {
    type: 'animation',
    input: string,
    caption?: string;
};

export type ImageResponse = {
    type: 'image',
    input: string,
    caption?: string;
}

export type TextResponse = {
    type: 'text',
    text: string,
}

export type UserResponse = AnimationResponse
    | ImageResponse
    | TextResponse;
