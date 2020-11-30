import * as fs from 'fs';
import assert from 'power-assert';
import * as AWSLambda from 'aws-lambda';
import * as AWSMock from 'aws-sdk-mock';

import { handleEvent } from './generate-thumbnails';
import { stubGetObject, stubPutObject } from '../../test/s3-mock';
import ApplicationError from '../application-error';

import { findS3Object } from '../../test/resources';
import { generateSnsEvent } from '../../events/sns';
import { generateSnsEventOfS3ObjectPut } from '../../events/sns/object-put';

const jpeg = findS3Object('jpeg', { local: true });
const pdf = findS3Object('pdf', { local: true });

// TODO: 一時ファイルの削除のテストを追加
// NOTE: 一時ファイルの削除処理をstub化すると一部のテストが失敗する（ファイルが削除されていないと失敗するテストがある）
describe('generateThumbnails', function() {
  this.timeout(5000);

  async function testApplicationError(event: AWSLambda.SNSEvent, code: string): Promise<void> {
    try {
      await handleEvent(event);

      throw new Error('Expected error not occurred');
    } catch (e) {
      if (!(e instanceof ApplicationError)) {
        assert.fail(e.message);
      }

      assert.equal(e.code, code);
    }
  }

  const topicName = 'upload-event-fanout-dev';
  const bucketName = 'test-bucket';
  const keyPrefix = 'test_prefix';
  const dirId = 'f6aa85cc-3c81-4892-8840-acabd1fcf4d2';
  const fileId = '678880d2-d041-433b-b7a2-200558961ce3';

  context('when the event format is invalid', () => {
    const snsEvent = generateSnsEvent(topicName, 'Hello World!');

    it('throws ApplicationError', async () => { await testApplicationError(snsEvent, 'InvalidParameter'); });
  });

  context('when the event is s3:TestEvent', () => {
    const s3TestEvent = {
      Service: 'Amazon S3',
      Event: 's3:TestEvent',
      Time: '1970-01-01T00:00:00.000Z',
      Bucket: 'test',
      RequestId: '0A6B5D0157650075',
      HostId: '1jE1iRA6+6NMvcr+OzeeXab8A/hxfxe4ecMCHpUfDnmfFoIVdQ1P14x6vEqCaxjrPqkl3ODvcr0='
    };
    const snsEvent = generateSnsEvent(topicName, JSON.stringify(s3TestEvent));

    it('returns null', async () => {
      const result = await handleEvent(snsEvent);

      assert.equal(result, null);
    });
  });

  context('when failed to fetch the S3 Object', () => {
    const event = generateSnsEventOfS3ObjectPut(topicName, bucketName, jpeg.key);

    beforeEach(() => {
      stubGetObject([]);
    });

    afterEach(() => {
      AWSMock.restore('S3');
    });

    it('throws ApplicationError', async () => { await testApplicationError(event, 'FailedToGetS3Object'); });
  });

  context('when the file is not an image', () => {
    const contentType = 'application/pdf';

    context('and the extension is jpg', () => {
      const key = `${keyPrefix}/${dirId}/${fileId}.jpg`;
      const event = generateSnsEventOfS3ObjectPut(topicName, bucketName, key);
      const body = fs.createReadStream(pdf.local as string);
      const s3Object = {
        key,
        body,
        contentType,
        contentLength: pdf.size,
      };

      beforeEach(() => {
        stubGetObject([s3Object]);
      });

      afterEach(() => {
        AWSMock.restore('S3');
      });

      it ('returns null', async () => {
        const response = await handleEvent(event);

        assert.equal(response, null);
      });
    });

    context('and the extension is pdf', () => {
      const key = `${keyPrefix}/${dirId}/${fileId}.pdf`;
      const event = generateSnsEventOfS3ObjectPut(topicName, bucketName, key);
      const body = fs.createReadStream(pdf.local as string);
      const s3Object = {
        key,
        body,
        contentType,
        contentLength: pdf.size,
      };

      beforeEach(() => {
        stubGetObject([s3Object]);
      });

      afterEach(() => {
        AWSMock.restore('S3');
      });

      it ('returns null', async () => {
        const response = await handleEvent(event);

        assert.equal(response, null);
      });
    });
  });

  context('when the file is JPEG', () => {
    const key = `${keyPrefix}/${dirId}/${fileId}.jpg`;
    const contentType = 'image/jpeg';
    const event = generateSnsEventOfS3ObjectPut(topicName, bucketName, key);
    const body = fs.readFileSync(jpeg.local as string);

    context('and fails to upload its thumbnails', () => {
      const s3Object = {
        key,
        body,
        contentType,
        contentLength: jpeg.size,
      };

      beforeEach(() => {
        stubGetObject([s3Object]);
        stubPutObject([]);
      });

      afterEach(() => {
        AWSMock.restore('S3');
      });

      it('throws ApplicationError', async () => { await testApplicationError(event, 'FailedToPutS3Object'); });
    });

    context('and the thumbnails are uploaded successfully', () => {
      const s3Object = {
        key,
        body,
        contentType,
        contentLength: jpeg.size,
      };
      const previewKeys = [
        // TODO: テスト時にprefixを指定できるように
        `test_thumbnails/${dirId}/${fileId}.jpg`,
        `test_thumbnails/${dirId}/${fileId}-128.jpg`,
        `test_thumbnails/${dirId}/${fileId}-512.jpg`,
      ];

      beforeEach(() => {
        stubGetObject([s3Object]);
        stubPutObject(previewKeys);
      });

      afterEach(() => {
        AWSMock.restore('S3');
      });

      it("returns the preview objects' urls", async () => {
        const response = await handleEvent(event);

        assert.equal(response && response[0], `s3://${bucketName}/${previewKeys[0]}`);
        assert.equal(response && response[128], `s3://${bucketName}/${previewKeys[1]}`);
        assert.equal(response && response[512], `s3://${bucketName}/${previewKeys[2]}`);
      });
    });
  });
});
