import { generateS3ObjectPutEvent } from '../s3';
import { generateSnsEvent } from './index';

export function generateSnsEventOfS3ObjectPut(topicName: string, bucketName: string, key: string, prefix?: string, size = 1024) {
  return  generateSnsEvent(topicName, JSON.stringify(generateS3ObjectPutEvent(bucketName, prefix ? `${prefix}/${key}` : key, size)));
}

export default generateSnsEventOfS3ObjectPut(
  process.env.SNS_TOPIC_NAME || 'event-fanout',
  process.env.S3_BUCKET || 'test',
  process.env.S3_OBJECT_KEY || 'key',
  process.env.S3_OBJECT_PREFIX,
);
