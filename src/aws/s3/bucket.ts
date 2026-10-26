import { S3Client, GetObjectCommand, PutObjectCommand, GetObjectOutput, PutObjectOutput } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from '@smithy/node-http-handler';
import fileSystem from '../../file-system';
import logger from '../../logger';
import ApplicationError from '../../application-error';
import ErrorCode from '../../error-code';

export default class S3Bucket {
  private s3: S3Client;

  constructor(public name: string, s3Client: (S3Client | null) = null) {
    this.s3 = s3Client ?? new S3Client({
      apiVersion: '2006-03-01',
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 30 * 1000,
        socketTimeout: 30 * 1000
      })
    });
  }

  async getObject(key: string): Promise<GetObjectOutput> {

    const url = `s3://${this.name}/${key}`;

    logger.verbose(`Fetching S3 Object (url=${url})`);

    try {
      const data = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.name,
          Key: key,
        })
      );
      logger.info(`Fetched S3 Object (url=${url})`);

      if (typeof data.Body === 'undefined') {
        return Promise.reject(new ApplicationError(ErrorCode.S3ObjectBodyEmpty, `S3 object body is empty (url=${url})`));
      }

      return data;
    } catch (error) {
      logger.error(JSON.stringify(error));

      return Promise.reject(new ApplicationError(ErrorCode.FailedToGetS3Object, `Failed to fetch S3 Object (url=${url})`));
    }

  }

  async putObject(key: string, filePath: string, contentType?: string): Promise<PutObjectOutput> {
    const url = `s3://${this.name}/${key}`;

    logger.verbose(`Putting S3 Object (url=${url})`);

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      const body = fileSystem.createReadStream(filePath);

      body.on('error', (error) => {
        logger.error(error);

        reject(new ApplicationError(ErrorCode.FailedToPutS3Object, `Failed to read file stream (path=${filePath}, error=${error.message})`));
      });

      try {
        const data = await this.s3.send(
          new PutObjectCommand({
            Bucket: this.name,
            Key: key,
            Body: body,
            ContentType: contentType,
          })
        );
        logger.info(`Put S3 Object (url=${url})`);
        logger.verbose(`response=${JSON.stringify(data)}`);
        resolve(data);
      } catch (error) {
        logger.error(error);
        reject(new ApplicationError(ErrorCode.FailedToPutS3Object, `Failed to put S3 Object (url=${url})`));
      }

    });
  }
}
