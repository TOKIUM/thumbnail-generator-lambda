import assert from 'power-assert';
import * as AWSMock from 'aws-sdk-mock';
import * as sinon from 'sinon';

import S3Bucket from '../aws/s3/bucket';
import S3Object from '../aws/s3/object';
import ImageService from './image-service';
import PdfService from './pdf-service';
import PreviewService from './preview-service';
import ApplicationError from '../application-error';
import ErrorCode from '../error-code';
import fileSystem from '../file-system';
import { stubPutObject } from '../../test/s3-mock';
import { mockCommand } from '../../test/child-process-mock';

import { findS3Object } from '../../test/resources';

const gif = findS3Object('gif', { local: true });
const jpeg = findS3Object('jpeg', { local: true });
const pdf = findS3Object('pdf', { local: true });
const png = findS3Object('png', { local: true });

interface SinonStub<T extends (...args: any[]) => any> extends sinon.SinonStub<Parameters<T>, ReturnType<T>>{ // eslint-disable-line @typescript-eslint/no-explicit-any
  // @types/sinon で未定義なのでパッチ
  wrappedMethod: T;
}

describe('PreviewService', () => {
  const dirId = '993c7f8e-555a-4f6e-ad63-03607cd085ad';
  const fileId = '3106f1f2-0572-4fca-b4f2-bd4b58547e9f';

  function buildS3Object(key: string, localPath: string, contentType: string): S3Object {
    const s3Bucket = new S3Bucket('test-bucket');

    return new S3Object(s3Bucket, key, localPath, contentType);
  }

  describe('.createPdfPreview', () => {
    const localPath = pdf.local as string;
    const contentType = 'application/pdf';

    async function assertApplicationError(key: string, code: string, message?: string): Promise<void> {
      const s3Object = buildS3Object(key, localPath, contentType);

      try {
        await PreviewService.createPdfPreview(s3Object);

        throw new Error('Expected error not occurred');
      } catch (e) {
        if (!(e instanceof ApplicationError)) {
          assert.fail(e.message);
        }

        assert.equal(e.code, code);

        if (message) {
          assert.equal(e.message, message);
        }
      }
    }

    afterEach(async () => { await fileSystem.clear(); });

    context('when failed to create a preview', () => {
      const key = `test_prefix/${dirId}/${fileId}.pdf`;
      const convertError = new ApplicationError(ErrorCode.CommandError, 'command error');
      let convertStub: sinon.SinonStub;

      beforeEach(() => {
        convertStub = sinon.stub(PdfService, 'convert').returns(Promise.reject(convertError));
      });

      afterEach(() => {
        convertStub?.restore();
      });

      it('throws an Error', async () => { await assertApplicationError(key, convertError.code, convertError.message); });
    });

    context('when failed to output the preview', () => {
      // 入力ファイルのサイズが0のときなどに発生. コマンド自体は成功する
      const key = `test_prefix/${dirId}/${fileId}.pdf`;
      const previewKey = PreviewService.getPdfPreviewKey(key);
      let execStub: sinon.SinonStub;

      beforeEach(() => {
        execStub = mockCommand(/^gs /i, (process) => {
          process.emit('exit', 0, null);
        });
        stubPutObject([previewKey]);
      });

      afterEach(() => {
        execStub?.restore();
        AWSMock.restore('S3');
      });

      it('throws an Error', async () => { await assertApplicationError(key, 'FailedToPutS3Object'); });
    });

    context('when failed to upload the preview', () => {
      const key = `test_prefix/${dirId}/${fileId}.pdf`;

      beforeEach(() => {
        stubPutObject([]);
      });

      afterEach(() => {
        AWSMock.restore('S3');
      });

      it('throws ApplicationError', async () => { await assertApplicationError(key, 'FailedToPutS3Object'); });
    });

    context('when uploaded the preview successfully', () => {
      function testPreviewKey(pdfExtension: string, previewExtension: string, prefix = 'test_prefix'): void {
        const pdfKey = `${prefix}/${dirId}/${fileId}${pdfExtension}`;
        const previewKey = `${prefix}/${dirId}/${fileId}${previewExtension}`;

        beforeEach(() => {
          stubPutObject([previewKey]);
        });

        afterEach(() => {
          AWSMock.restore('S3');
        });

        it(`returns the preview object, whose extension is ${previewExtension}`, async () => {
          const s3Object = buildS3Object(pdfKey, localPath, contentType);
          const previewObject = await PreviewService.createPdfPreview(s3Object);

          assert.equal(previewObject.key, previewKey);
          assert.equal(previewObject.contentType, 'image/jpeg');
        });
      }

      context('and the extension is .pdf', () => { testPreviewKey('.pdf', '.jpeg', 'test_prefix'); });
      context('and the extension is .PDF', () => { testPreviewKey('.PDF', '.jpeg', 'test_prefix'); });
      context('and the extension is .jpeg', () => { testPreviewKey('.jpeg', '.jpeg.jpeg', 'test_prefix'); });
      context('and the extension is .jpg.pdf', () => { testPreviewKey('.jpeg.pdf', '.jpeg.jpeg', 'test_prefix'); });
    });
  });

  describe('.createThumbnails', function() {
    this.timeout(20000); // GIFの変換が2秒で終わらないので延長

    afterEach(async () => { await fileSystem.clear(); });

    /**
     * ImageService.resize, ImageService.resizeAnimationをstub化する.
     * contentTypeに応じて、一方のメソッドのみstub化するために使う.
     *
     * @param contentType
     * @param error - 発生するエラー. errorSizesの指定がある時は必須.
     * @param errorSizes - エラーを発生させるサイズ
     */
    function stubResize(contentType: string, error: Error, errorSizes: number[] = []): SinonStub<typeof ImageService.resize> | SinonStub<typeof ImageService.resizeAnimation> {
      let stub: SinonStub<typeof ImageService.resize> | SinonStub<typeof ImageService.resizeAnimation>;

      if (contentType === 'image/gif') {
        stub = sinon.stub(ImageService, 'resizeAnimation') as SinonStub<typeof ImageService.resizeAnimation>;
      } else {
        stub = sinon.stub(ImageService, 'resize') as SinonStub<typeof ImageService.resize>;
      }

      stub.callsFake((inputPath: string, outputPath: string, options: { size?: number } = {}) => {
        // 一部だけ失敗するようにする
        if (errorSizes.includes(options.size ?? 0)) {
          return Promise.reject(error);
        }

        return stub.wrappedMethod.bind(ImageService)(inputPath, outputPath, options);
      });

      return stub;
    }

    function getPreviewKeys(directory: string, baseName: string, extension: string, sizes: number[]): string[] {
      return sizes.map((size) => {
        // TODO: prefixをテスト時に指定できるように
        return `test_thumbnails/${directory}/${baseName}${size > 0 ? `-${size}` : ''}${extension}`;
      });
    }

    function testContentType(contentType: string, localPath: string): void {
      const normalExt = contentType === 'image/jpeg' ? '.jpg' : contentType === 'image/png' ? '.png' : '.gif';
      const key = `test_prefix/${dirId}/${fileId}${normalExt}`;
      const thumbnailExt = contentType === 'image/gif' ? '.gif' : '.jpg';

      async function assertApplicationError(key: string, code: string, message?: string): Promise<void> {
        const s3Object = buildS3Object(key, localPath, contentType);

        try {
          await PreviewService.createThumbnails(s3Object);

          throw new Error('Expected error not occurred');
        } catch (e) {
          if (!(e instanceof ApplicationError)) {
            assert.fail(e.message);
          }

          assert.equal(e.code, code);

          if (message) {
            assert.equal(e.message, message);
          }
        }
      }

      context('when failed to create the base image', () => {
        const resizeError = new ApplicationError(ErrorCode.CommandError, 'command error');
        let resizeStub: SinonStub<typeof ImageService.resize> | SinonStub<typeof ImageService.resizeAnimation>;

        beforeEach(() => {
          resizeStub = stubResize(contentType, resizeError, [0]);
        });

        afterEach(() => {
          resizeStub?.restore();
        });

        it('throws an Error', async () => { await assertApplicationError(key, resizeError.code, resizeError.message); });
      });

      context('when failed to output the base image', () => {
        // 入力ファイルのサイズが0のときなどに発生. コマンド自体は成功する
        let execStub: sinon.SinonStub;

        beforeEach(async () => {
          execStub = mockCommand(/^convert /i, (process) => {
            process.emit('exit', 0, null);
          });
          stubPutObject(getPreviewKeys(dirId, fileId, thumbnailExt, [0, 128, 512]));
        });

        afterEach(() => {
          execStub?.restore();
          AWSMock.restore('S3');
        });

        it('throws an Error', async () => { await assertApplicationError(key, 'FailedToPutS3Object'); });
      });

      context('when failed to upload the base image', () => {
        beforeEach(() => {
          stubPutObject([]);
        });

        afterEach(() => {
          AWSMock.restore('S3');
        });

        it('throws ApplicationError', async () => {
          const s3Object = buildS3Object(key, localPath, contentType);

          try {
            await PreviewService.createThumbnails(s3Object);

            throw new Error('Expected error not occurred');
          } catch (e) {
            if (!(e instanceof ApplicationError)) {
              assert.fail(e.message);
            }

            assert.equal(e.code, 'FailedToPutS3Object');
          }
        });
      });

      context('when failed to create some thumbnails', () => {
        const resizeError = new ApplicationError(ErrorCode.CommandError, 'command error');
        let resizeStub: SinonStub<typeof ImageService.resize> | SinonStub<typeof ImageService.resizeAnimation>;

        beforeEach(() => {
          // 一部だけ失敗するようにする
          resizeStub = stubResize(contentType, resizeError, [512]);

          stubPutObject(getPreviewKeys(dirId, fileId, thumbnailExt, [0, 128, 512]));
        });

        afterEach(() => {
          resizeStub?.restore();
          AWSMock.restore('S3');
        });

        it('throws an Error', async () => {
          const s3Object = buildS3Object(key, localPath, contentType);

          try {
            await PreviewService.createThumbnails(s3Object);

            throw new Error('Expected error not occurred');
          } catch (e) {
            if (!(e instanceof ApplicationError)) {
              assert.fail(e.message);
            }

            assert.equal(e.code, resizeError.code);
            assert.equal(e.message, resizeError.message);
          }
        });
      });

      context('when failed to upload some thumbnails', () => {
        beforeEach(() => {
          // 512だけ失敗する
          stubPutObject(getPreviewKeys(dirId, fileId, thumbnailExt, [0, 128]));
        });

        afterEach(() => {
          AWSMock.restore('S3');
        });

        it('throws ApplicationError', async () => {
          const s3Object = buildS3Object(key, localPath, contentType);

          try {
            await PreviewService.createThumbnails(s3Object);

            throw new Error('Expected error not occurred');
          } catch (e) {
            if (!(e instanceof ApplicationError)) {
              assert.fail(e.message);
            }

            assert.equal(e.code, 'FailedToPutS3Object');
          }
        });
      });

      context('when uploaded thumbnails successfully', () => {
        function testThumbnailKeys(baseName: string, inputExtension: string, prefix = 'test_prefix'): void {
          const inputKey = `${prefix}/${dirId}/${baseName}${inputExtension}`;
          const previewSizes = [0, 128, 512];
          const previewKeys = getPreviewKeys(dirId, baseName, thumbnailExt, previewSizes);

          beforeEach(() => {
            stubPutObject(previewKeys);
          });

          afterEach(() => {
            AWSMock.restore('S3');
          });

          it(`returns thumbnail objects`, async () => {
            const s3Object = buildS3Object(inputKey, localPath, contentType);
            const previewObjects = await PreviewService.createThumbnails(s3Object);

            previewObjects.forEach(([size, previewObject], idx) => {
              assert.equal(size, previewSizes[idx]);
              assert.equal(previewObject.key, previewKeys[idx]);
              assert.equal(previewObject.contentType, contentType === 'image/gif' ? 'image/gif' : 'image/jpeg');
            });
          });
        }

        context(`and the extension is ${normalExt}`, () => { testThumbnailKeys(fileId, normalExt, 'test_prefix'); });
        context(`and the extension is .pdf${normalExt}`, () => { testThumbnailKeys(`${fileId}.pdf`, normalExt, 'test_prefix'); });
      });
    }

    context('when the input file is JPEG', () => { testContentType('image/jpeg', jpeg.local as string); });
    context('when the input file is PNG', () => { testContentType('image/png', png.local as string); });
    context('when the input file is GIF', () => { testContentType('image/gif', gif.local as string); });
  });
});
