import { S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import assert from 'power-assert';

import S3Bucket from './bucket';
import ApplicationError from '../../application-error';
import fileSystem from '../../file-system';
import { stubGetObject, stubPutObject } from '../../../test/s3-mock';

let s3Mock = mockClient(S3Client);

// stubGetObject / stubPutObject で設定したモックを S3Bucket に注入する
// （preview-service.test / handlers のテストと同じ作法。グローバルな
//  prototype 差し替えに依存しないため、他テストとの干渉を受けない）
function buildBucket(): S3Bucket {
  return new S3Bucket('test-bucket', s3Mock as unknown as S3Client);
}

async function assertApplicationError(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();

    throw new Error('Expected error not occurred');
  } catch (e) {
    if (!(e instanceof ApplicationError)) {
      assert.fail(e instanceof Error ? e.message : String(e));
    }

    assert.equal(e.code, code);
  }
}

describe('S3Bucket', () => {
  describe('#getObject', () => {
    const key = 'prefix/dir/file.png';

    afterEach(() => { s3Mock.reset(); });

    context('when the object exists', () => {
      beforeEach(() => { s3Mock = stubGetObject([{ key, body: 'content', contentType: 'image/png' }]); });

      it('returns the S3 response', async () => {
        const response = await buildBucket().getObject(key);

        assert.equal(response.ContentType, 'image/png');
      });
    });

    context('when the body is empty', () => {
      beforeEach(() => { s3Mock = stubGetObject([{ key, body: void 0, contentType: 'image/png' }]); });

      it('throws ApplicationError(S3ObjectBodyEmpty)', async () => {
        await assertApplicationError(() => buildBucket().getObject(key), 'S3ObjectBodyEmpty');
      });
    });

    context('when the object does not exist', () => {
      beforeEach(() => { s3Mock = stubGetObject([]); });

      it('throws ApplicationError(FailedToGetS3Object)', async () => {
        await assertApplicationError(() => buildBucket().getObject(key), 'FailedToGetS3Object');
      });
    });
  });

  describe('#putObject', () => {
    const key = 'prefix/dir/file.txt';
    const filePath = '/tmp/s3-bucket-test-upload.txt';

    beforeEach(async () => { await fileSystem.writeFile(filePath, 'dummy body'); });
    afterEach(async () => { s3Mock.reset(); await fileSystem.clear(); });

    context('when the upload is allowed', () => {
      beforeEach(() => { s3Mock = stubPutObject([key]); });

      it('resolves with the put response', async () => {
        const response = await buildBucket().putObject(key, filePath, 'text/plain');

        assert.ok(response.ETag);
      });
    });

    context('when the upload is denied', () => {
      beforeEach(() => { s3Mock = stubPutObject([]); });

      it('throws ApplicationError(FailedToPutS3Object)', async () => {
        await assertApplicationError(() => buildBucket().putObject(key, filePath, 'text/plain'), 'FailedToPutS3Object');
      });
    });
  });
});
