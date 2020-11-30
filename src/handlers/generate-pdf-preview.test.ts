import * as fs from 'fs';
import assert from 'power-assert';
import * as AWSLambda from 'aws-lambda';
import * as AWSMock from 'aws-sdk-mock';

import { handleEvent } from './generate-pdf-preview';
import { stubGetObject, stubPutObject } from '../../test/s3-mock';
import ApplicationError from '../application-error';
import PreviewService from '../services/preview-service';

import { findS3Object } from '../../test/resources';
import { generateSnsEvent } from '../../events/sns';
import { generateSnsEventOfS3ObjectPut } from '../../events/sns/object-put';

const jpeg = findS3Object('jpeg', { local: true });
const pdf = findS3Object('pdf', { local: true });

// TODO: 一時ファイルの削除のテストを追加
// NOTE: 一時ファイルの削除処理をstub化すると一部のテストが失敗する（ファイルが削除されていないと失敗するテストがある）
describe('generatePdfPreview', () => {
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
  const dirId = '1405d636-d22b-41ce-9d05-68c70bd69caf';
  const fileId = '59969ed8-e4f7-4e13-9cb1-ce81d06a4da6';

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
    const event = generateSnsEventOfS3ObjectPut(topicName, bucketName, jpeg.key, void 0, jpeg.size);

    beforeEach(() => {
      stubGetObject([]);
    });

    afterEach(() => {
      AWSMock.restore('S3');
    });

    it('throws ApplicationError', async () => { await testApplicationError(event, 'FailedToGetS3Object'); });
  });

  context('when the S3 Object body is empty', () => {
    const key = `${keyPrefix}/${dirId}/${fileId}.pdf`;
    const event = generateSnsEventOfS3ObjectPut(topicName, bucketName, key);
    const s3Object = {
      key,
      body: void 0,
      contentType: 'application/pdf',
      contentLength: pdf.size,
    };

    beforeEach(() => {
      stubGetObject([s3Object]);
    });

    afterEach(() => {
      AWSMock.restore('S3');
    });

    it('throws ApplicationError', async () => { await testApplicationError(event, 'S3ObjectBodyEmpty'); });
  });

  context('when the file is not PDF', () => {
    const contentType = 'image/jpeg';

    context('and the extension is jpg', () => {
      const key = `${keyPrefix}/${dirId}/${fileId}.jpg`;
      const event = generateSnsEventOfS3ObjectPut(topicName, bucketName, key);
      const body = fs.createReadStream(jpeg.local as string);
      const s3Object = {
        key,
        body,
        contentType,
        contentLength: jpeg.size,
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
      const body = fs.createReadStream(jpeg.local as string);
      const s3Object = {
        key,
        body,
        contentType,
        contentLength: jpeg.size,
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

  context('when the file is PDF', () => {
    const contentType = 'application/pdf';

    context('and fails to upload the preview', () => {
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
        stubPutObject([]);
      });

      afterEach(() => {
        AWSMock.restore('S3');
      });

      it('throws ApplicationError', async () => { await testApplicationError(event, 'FailedToPutS3Object'); });
    });

    context('and the preview is uploaded successfully', () => {
      const key = `${keyPrefix}/${dirId}/${fileId}.pdf`;
      const event = generateSnsEventOfS3ObjectPut(topicName, bucketName, key);
      const body = fs.readFileSync(pdf.local as string);
      const s3Object = {
        key,
        body,
        contentType,
        contentLength: pdf.size,
      };
      const previewKey = PreviewService.getPdfPreviewKey(key);

      beforeEach(() => {
        stubGetObject([s3Object]);
        stubPutObject([previewKey]);
      });

      afterEach(() => {
        AWSMock.restore('S3');
      });

      it('returns the preview object url', async () => {
        const response = await handleEvent(event);

        assert.equal(response, `s3://${bucketName}/${previewKey}`);
      });
    });
  });
});
