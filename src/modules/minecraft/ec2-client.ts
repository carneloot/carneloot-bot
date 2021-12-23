import { EC2Client } from '@aws-sdk/client-ec2';

const {
    MINECRAFT_AWS_REGION,
    MINECRAFT_AWS_SECRET_ACCESS_KEY,
    MINECRAFT_AWS_ACCESS_KEY_ID
} = process.env;

export const createEC2Client = () => new EC2Client({
    region: MINECRAFT_AWS_REGION!,
    credentials: {
        accessKeyId: MINECRAFT_AWS_ACCESS_KEY_ID!,
        secretAccessKey: MINECRAFT_AWS_SECRET_ACCESS_KEY!,
    }
});
