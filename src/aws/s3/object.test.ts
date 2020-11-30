import * as fs from 'fs';
import { Readable } from 'stream';
import assert from 'power-assert';
import * as AWSMock from 'aws-sdk-mock';

import ApplicationError from '../../application-error';
import S3Bucket from './bucket';
import S3Object from './object';
import fileSystem from '../../file-system';
import { stubGetObject } from '../../../test/s3-mock';

import { findS3Object } from '../../../test/resources';

const gif = findS3Object('gif', { local: true });
const jpeg = findS3Object('jpeg', { local: true });
const pdf = findS3Object('pdf', { local: true });
const png = findS3Object('png', { local: true });

describe('S3Object', () => {
  const dirId = 'c1498906-fc00-41ad-a3a7-a38cb615a6db';
  const fileId = '1159703e-b691-47cb-a684-ddf0919a7243';

  describe('.buildFromKey', () => {
    const bucketName = 'test-bucket';

    afterEach(async () => { await fileSystem.clear(); });

    async function assertApplicationError(key: string, code: string): Promise<void> {
      try {
        await S3Object.buildFromKey(bucketName, key);

        throw new Error('Expected error not occurred');
      } catch (e) {
        if (!(e instanceof ApplicationError)) {
          assert.fail(e.message);
        }

        assert.equal(e.code, code);
      }
    }

    function testBody(prefix: string, directory: string, baseName: string, extension: string, body: Readable | Buffer, contentType: string, size: number): void {
      const key = `${prefix}/${directory}/${baseName}${extension}`;
      const s3Object = { key, contentType, body };

      beforeEach(() => {
        stubGetObject([s3Object]);
      });

      afterEach(() => {
        AWSMock.restore('S3');
      });

      it('returns a S3Object', async () => {
        const s3Object = await S3Object.buildFromKey(bucketName, key);

        assert.equal(s3Object.bucket.name, bucketName);
        assert.equal(s3Object.key, key);
        assert.equal(s3Object.prefix, prefix);
        assert.equal(s3Object.directory, directory);
        assert.equal(s3Object.baseName, baseName);
        assert.equal(s3Object.fileName, `${baseName}${extension}`);
        assert.equal(s3Object.extension, extension);
        assert.equal(s3Object.contentType, contentType);

        const body = fs.readFileSync(s3Object.filePath);

        assert.equal(body.length, size);
      });
    }

    context('when failed to get its content', () => {
      const key = `test_prefix/${dirId}/${fileId}.pdf`;

      beforeEach(() => {
        stubGetObject([]);
      });

      afterEach(() => {
        AWSMock.restore('S3');
      });

      it('throws ApplicationError', async () => { await assertApplicationError(key, 'FailedToGetS3Object'); });
    });

    context('when the body is empty', () => {
      const key = `test_prefix/${dirId}/${fileId}.jpg`;
      const contentType = 'image/jpeg';
      const s3Object = { key, contentType, body: void 0 };

      beforeEach(() => {
        stubGetObject([s3Object]);
      });

      afterEach(() => {
        AWSMock.restore('S3');
      });

      it('throws ApplicationError', async () => { await assertApplicationError(key, 'S3ObjectBodyEmpty'); });
    });

    context('when the body is PDF (Stream)', () => {
      testBody('test_prefix', dirId, fileId, '.pdf', fs.createReadStream(pdf.local as string), 'application/pdf', pdf.size);
    });

    context('when the body is PDF (Buffer)', () => {
      testBody('test_prefix', dirId, `${fileId}.jpg`, '.PDF', fs.readFileSync(pdf.local as string), 'application/pdf', pdf.size);
    });

    context('when the body is JPEG (Stream)', () => {
      testBody('test_prefix', dirId, fileId, '.jpg', fs.createReadStream(jpeg.local as string), 'image/jpeg', jpeg.size);
    });

    context('when the body is JPEG (Buffer)', () => {
      testBody('test_prefix', dirId, fileId, '.JPEG', fs.createReadStream(jpeg.local as string), 'image/jpeg', jpeg.size);
    });
  });

  describe('#isPdf', () => {
    function testIsPdf(path: string, extension: string, contentType: string, isPdf: boolean): void {
      it(`returns ${isPdf}`, () => {
        const s3Bucket = new S3Bucket('test-bucket');
        const key = `test_prefix/${dirId}/${fileId}${extension}`;
        const s3Object = new S3Object(s3Bucket, key, path, contentType);

        assert.equal(s3Object.isPdf, isPdf);
      });
    }

    context('when the content type is application/pdf', () => { testIsPdf(pdf.local as string, '.pdf', 'application/pdf', true); });
    context('when the content type is image/jpeg', () => { testIsPdf(jpeg.local as string, '.pdf', 'image/jpeg', false); });
    context('when the content type is image/png', () => { testIsPdf(png.local as string, '.pdf', 'image/png', false); });
    context('when the content type is image/gif', () => { testIsPdf(gif.local as string, '.pdf', 'image/gif', false); });
  });

  describe('#isGif', () => {
    function testIsGif(path: string, extension: string, contentType: string, isGif: boolean): void {
      it(`returns ${isGif}`, () => {
        const s3Bucket = new S3Bucket('test-bucket');
        const key = `test_prefix/${dirId}/${fileId}${extension}`;
        const s3Object = new S3Object(s3Bucket, key, path, contentType);

        assert.equal(s3Object.isGif, isGif);
      });
    }

    context('when the content type is application/pdf', () => { testIsGif(pdf.local as string, '.gif', 'application/pdf', false); });
    context('when the content type is image/jpeg', () => { testIsGif(jpeg.local as string, '.gif', 'image/jpeg', false); });
    context('when the content type is image/png', () => { testIsGif(png.local as string, '.gif', 'image/png', false); });
    context('when the content type is image/gif', () => { testIsGif(gif.local as string, '.gif', 'image/gif', true); });
  });
});
