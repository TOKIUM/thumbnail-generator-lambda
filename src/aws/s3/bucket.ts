import * as AWS from 'aws-sdk';
import fileSystem from '../../file-system';
import logger from '../../logger';
import ApplicationError from '../../application-error';
import ErrorCode from '../../error-code';

export default class S3Bucket {
  private s3: AWS.S3;

  constructor(public name: string) {
    this.s3 = new AWS.S3({ apiVersion: '2006-03-01', httpOptions: { connectTimeout: 30 * 1000, timeout: 30 * 1000 } });
  }

  getObject(key: string): Promise<AWS.S3.GetObjectOutput> {
    const url = `s3://${this.name}/${key}`;

    logger.verbose(`Fetching S3 Object (url=${url})`);

    return this.s3.getObject({
      Bucket: this.name,
      Key: key,
    }).promise().then((data) => {
      logger.info(`Fetched S3 Object (url=${url})`);

      if (typeof data.Body === 'undefined') {
        return Promise.reject(new ApplicationError(ErrorCode.S3ObjectBodyEmpty, `S3 object body is empty (url=${url})`));
      }

      return data;
    }, (error) => {
      logger.error(JSON.stringify(error));

      return Promise.reject(new ApplicationError(ErrorCode.FailedToGetS3Object, `Failed to fetch S3 Object (url=${url})`));
    });
  }

  putObject(key: string, filePath: string, contentType?: string): Promise<AWS.S3.PutObjectOutput> {
    const url = `s3://${this.name}/${key}`;

    logger.verbose(`Putting S3 Object (url=${url})`);

    return new Promise((resolve, reject) => {
      const body = fileSystem.createReadStream(filePath);

      body.on('error', (error) => {
        logger.error(error);

        reject(new ApplicationError(ErrorCode.FailedToPutS3Object, `Failed to read file stream (path=${filePath}, error=${error.message})`));
      });

      this.s3.putObject({
        Bucket: this.name,
        Key: key,
        Body: body,
        ContentType: contentType,
      }, (error, data) => {
        if (error) {
          logger.error(error);

          reject(new ApplicationError(ErrorCode.FailedToPutS3Object, `Failed to put S3 Object (url=${url})`));
          return;
        }

        logger.info(`Put S3 Object (url=${url})`);
        logger.verbose(`response=${JSON.stringify(data)}`);

        resolve(data);
      });
    });
  }
}
