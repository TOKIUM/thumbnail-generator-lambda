import * as path from 'path';
import { Readable } from 'stream';
import fileSystem, { Encoding } from '../../file-system';
import S3Bucket from './bucket';
import logger from '../../logger';

type S3Body = string | Uint8Array | Buffer | Readable;

export default class S3Object {
  public prefix: string;
  public directory: string;
  public fileName: string;
  public baseName: string;
  public extension: string;

  /**
   * NOTE: keyは `prefix/xxx/yyy.jpg` のように、スラッシュが中に2つ入る形式
   * TODO: prefixのみが必須で、配下の階層構造は自由にできるように
   */
  constructor(public bucket: S3Bucket, public key: string, public filePath: string, public contentType?: string) {
    const pathObj = path.parse(key);

    this.extension = pathObj.ext;
    this.fileName = pathObj.base;
    this.baseName = pathObj.name;
    this.directory = path.basename(pathObj.dir);
    this.prefix = path.dirname(pathObj.dir);
  }

  static async buildFromKey(bucketName: string, key: string): Promise<S3Object> {
    const bucket = new S3Bucket(bucketName);

    const response = await bucket.getObject(key);
    const filePath = `/tmp/${path.basename(key)}`;

    await this.saveLocally(filePath, response.Body as S3Body);

    return new S3Object(bucket, key, filePath, response.ContentType);
  }

  private static async saveLocally(path: string, body: S3Body): Promise<void> {
    const options = { encoding: 'hex' as Encoding };

    logger.verbose(`Saving the s3 object to ${path}...`);

    if (body instanceof Readable) {
      const outputStream = fileSystem.createWriteStream(path, options);

      return new Promise((resolve, reject) => {
        body.pipe(outputStream);

        outputStream.on('close', () => {
          logger.info(`Saved the s3 object to ${path}`);
          resolve();
        });
        body.on('error', (error) => {
          logger.error(error);
          reject(error);
        });
      });
    }

    return fileSystem.writeFile(path, body, options);
  }

  get isPdf(): boolean {
    return this.contentType === 'application/pdf';
  }

  get isGif(): boolean {
    return this.contentType === 'image/gif';
  }

  /**
   * S3にアップロードする
   */
  async save(): Promise<void> {
    return this.bucket.putObject(this.key, this.filePath, this.contentType)
      .then(() => (void 0));
  }
}
