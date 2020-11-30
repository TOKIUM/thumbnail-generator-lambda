import { ContentType, findS3Object } from '../../test/resources';
import { generateSnsEventOfS3ObjectPut } from './object-put';

export default function generateSnsEventOfFilePut(type: ContentType) {
  const { key, size } = findS3Object(type);
  const bucket = process.env.S3_BUCKET || 'test';
  const prefix = process.env.S3_OBJECT_PREFIX;
  const topicName = process.env.SNS_TOPIC_NAME || 'event-fanout';

  return generateSnsEventOfS3ObjectPut(topicName, bucket, key, prefix, size);
}
