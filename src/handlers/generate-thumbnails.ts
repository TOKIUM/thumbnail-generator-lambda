import * as AWSLambda from 'aws-lambda';
import S3Object from '../aws/s3/object';
import PreviewService from '../services/preview-service';
import ApplicationError from '../application-error';
import ErrorCode from '../error-code';
import fileSystem from '../file-system';
import logger, { applyBugsnag } from '../logger';

type PreviewResponse = { [key: number]: string };

/**
 * 画像ファイルのサムネイルを生成し、S3に保存する.
 *
 * @return 生成されたサムネイルのサイズをkeyとし、URLをvalueとするObject. ただし、サムネイルが生成されなかった場合（PDFアップロード）はnullを返す.
 */
export async function handleEvent(event: AWSLambda.SNSEvent): Promise<PreviewResponse | null> {
  logger.info(`event: ${JSON.stringify(event, null, 2)}`);

  const message = event.Records[0].Sns.Message;

  let s3Event: AWSLambda.S3Event;

  try {
    s3Event = JSON.parse(message);
  } catch (error) {
    throw new ApplicationError(ErrorCode.InvalidParameter, message);
  }

  try {
    if (!s3Event.Records) {
      // s3:TestEventなるイベントが飛んでくる
      logger.info('Skipping this event because its format is invalid');
      return null;
    }

    const bucketName = s3Event.Records[0].s3.bucket.name;
    const key = decodeURI(s3Event.Records[0].s3.object.key);
    const s3Object = await S3Object.buildFromKey(bucketName, key);

    if (s3Object.isPdf) {
      logger.info(`Skipping this event because the file is PDF: s3://${bucketName}/${key}`);
      return null;
    }

    const previews = await PreviewService.createThumbnails(s3Object);

    return previews.reduce((acc, [size, object]) => {
      acc[size] = `s3://${object.bucket.name}/${object.key}`;
      return acc;
    }, {} as PreviewResponse);
  } finally {
    fileSystem.clear();
  }
}

const generateThumbnails = applyBugsnag(handleEvent, void 0, (event) => {
  return { event };
});

export default generateThumbnails;
