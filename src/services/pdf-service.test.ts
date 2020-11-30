import assert from 'power-assert';
import * as sinon from 'sinon';

import ApplicationError from '../application-error';
import PdfService from './pdf-service';
import fileSystem from '../file-system';
import { mockCommand } from '../../test/child-process-mock';

import { findS3Object } from '../../test/resources';

const jpeg = findS3Object('jpeg', { local: true });
const pdf = findS3Object('pdf', { local: true });

describe('PdfService', () => {
  describe('.convert', () => {
    const fileId = '75941305-2679-46bc-ae0d-947ea601a806';
    const jpegPath = `/tmp/${fileId}.jpeg`;

    afterEach(async () => {
      await fileSystem.clear();
    });

    async function testCommandError(pdfPath: string): Promise<void> {
      try {
        await PdfService.convert(pdfPath, jpegPath);

        throw new Error('Expected error not occurred');
      } catch (e) {
        if (!(e instanceof ApplicationError)) {
          assert.fail(e.message);
        }

        assert.equal(e.code, 'CommandError');
        assert.equal(fileSystem.files.includes(jpegPath), true);
      }
    }

    context('when gs command is not installed', () => {
      let execStub: sinon.SinonStub;

      beforeEach(() => {
        execStub = mockCommand(/^gs /i, (process) => {
          process.stderr?.emit('data', '/bin/sh: gs: command not found');
          process.emit('exit', 127, null);
        });
      });

      afterEach(() => {
        execStub?.restore();
      });

      it('throws CommandError', async () => { await testCommandError(pdf.local as string); });
    });

    context('when pdfinfo command is not installed', () => {
      let execStub: sinon.SinonStub;

      beforeEach(() => {
        execStub = mockCommand(/^pdfinfo /i, (process) => {
          process.stderr?.emit('data', '/bin/sh: pdfinfo: command not found');
          process.emit('exit', 127, null);
        });
      });

      afterEach(() => {
        execStub?.restore();
      });

      it('ignores the error and creates a JPEG file', async () => {
        await PdfService.convert(pdf.local as string, jpegPath);
        assert.equal(fileSystem.files.includes(jpegPath), true);
      });
    });

    context('when the PDF content is invalid', () => {
      // 中身がPDFでない
      it('throws CommandError', async () => { await testCommandError(jpeg.local as string); });
    });

    context("when the PDF's page size is not detected", () => {
      let getPreviewSizeStub: sinon.SinonStub;

      beforeEach(() => {
        getPreviewSizeStub = sinon.stub(PdfService, 'getPreviewSize').returns(Promise.resolve(null));
      });

      afterEach(() => {
        getPreviewSizeStub?.restore();
      });

      it('creates a JPEG file', async () => {
        await PdfService.convert(pdf.local as string, jpegPath);
        assert.equal(fileSystem.files.includes(jpegPath), true);
      });
    });

    context("when the PDF's page size is detected successfully", () => {
      let getPreviewSizeStub: sinon.SinonStub;

      beforeEach(() => {
        getPreviewSizeStub = sinon.stub(PdfService, 'getPreviewSize').returns(Promise.resolve({ width: 900, height: 1200 }));
      });

      afterEach(() => {
        getPreviewSizeStub?.restore();
      });

      it('creates a JPEG file', async () => {
        await PdfService.convert(pdf.local as string, jpegPath);
        assert.equal(fileSystem.files.includes(jpegPath), true);
      });
    });
  });

  describe('.getPreviewSize', () => {
    function buildPdfinfoOutput(pageSize: string): string {
      const lines = [
        'Author:         Evangelos Vlachogiannis',
        'Creator:        Writer',
        'Producer:       OpenOffice.org 2.1',
        'CreationDate:   Sat Feb 24 00:56:37 2007 JST',
        'Tagged:         no',
        'UserProperties: no',
        'Suspects:       no',
        'Form:           none',
        'JavaScript:     no',
        'Pages:          1',
        'Encrypted:      no',
        `Page size:      ${pageSize}`,
        'Page rot:       0',
        'File size:      13264 bytes',
        'Optimized:      no',
        'PDF version:    1.4',
      ];

      return lines.join('\n');
    }

    context('when pdfinfo command is not installed', () => {
      let execStub: sinon.SinonStub;

      beforeEach(() => {
        execStub = mockCommand(/^pdfinfo /i, (process) => {
          process.stderr?.emit('data', '/bin/sh: pdfinfo: command not found');
          process.emit('exit', 127, null);
        });
      });

      afterEach(() => {
        execStub?.restore();
      });

      it('throws CommandError', async () => {
        try {
          await PdfService.getPreviewSize(pdf.local as string, 300);

          throw new Error('Expected error not occurred');
        } catch (e) {
          if (!(e instanceof ApplicationError)) {
            assert.fail(e.message);
          }

          assert.equal(e.code, 'CommandError');
        }
      });
    });

    context("when pdfinfo outputs in an unknown format", () => {
      let execStub: sinon.SinonStub;

      beforeEach(() => {
        execStub = mockCommand(/^pdfinfo /i, (process) => {
          process.stdout?.emit('data', 'UNKNOWN FORMAT');
          process.emit('exit', 0, null);
          process.stdout?.emit('end');
        });
      });

      afterEach(() => {
        execStub?.restore();
      });

      it('returns null', async () => {
        const pageSize = await PdfService.getPreviewSize(pdf.local as string, 300);
        assert.equal(pageSize, null);
      });
    });

    context("when the PDF's page size is A4", () => {
      it('returns A4 size in pixel', async () => {
        const pageSize = await PdfService.getPreviewSize(pdf.local as string, 300);
        assert.equal(pageSize?.width, 2480);
        assert.equal(pageSize?.height, 3508);
      });
    });

    context("when the PDF's page size is large", () => {
      let execStub: sinon.SinonStub;

      beforeEach(() => {
        execStub = mockCommand(/^pdfinfo /i, (process) => {
          process.stdout?.emit('data', buildPdfinfoOutput('3492 x 4656 pts'));
          process.emit('exit', 0, null);
          process.stdout?.emit('end');
        });
      });

      afterEach(() => {
        execStub?.restore();
      });

      it('returns a reduced size in pixel', async () => {
        const pageSize = await PdfService.getPreviewSize(pdf.local as string, 300);
        const threshold = 3510; // A4の長辺ぐらい
        assert.equal((pageSize?.width || threshold) < threshold, true);
        assert.equal((pageSize?.height || threshold) < threshold, true);
      });
    });
  });
});
