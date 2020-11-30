import * as AWSLambda from 'aws-lambda';
import S3Object from '../aws/s3/object';
import PreviewService from '../services/preview-service';
import ApplicationError from '../application-error';
import ErrorCode from '../error-code';
import fileSystem from '../file-system';
import logger, { applyBugsnag } from '../logger';

function logError(e: Error): void {
  if (e instanceof ApplicationError) {
    logger.error(`[${e.code}] ${e.message}`);
  } else {
    logger.error(e);
  }
}

/**
 * PDFのプレビュー画像を生成し、S3に保存する.
 *
 * @return 生成されたプレビューのURL. ただし、プレビューが生成されなかった場合（PDF以外のファイルアップロード）はnullを返す.
 */
export async function handleEvent(event: AWSLambda.SNSEvent): Promise<string | null> {
  logger.info(`event=${JSON.stringify(event, null, 2)}`);

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

    if (!s3Object.isPdf) {
      logger.info(`Skipping this event because the file is not PDF: s3://${bucketName}/${key}`);
      return null;
    }

    const previewObject = await PreviewService.createPdfPreview(s3Object);

    return `s3://${previewObject.bucket.name}/${previewObject.key}`;
  } catch (e) {
    logError(e);

    const error = e instanceof ApplicationError ? e: new ApplicationError(ErrorCode.InternalServerError, e.message);

    throw error;
  } finally {
    try {
      await fileSystem.clear();
    } catch (e) {
      // 本来の処理は完了しているので、エラーは握りつぶす
      logError(e);
    }
  }
}

const generatePdfPreview = applyBugsnag(handleEvent, void 0, (event) => {
  return { event };
});

export default generatePdfPreview;
