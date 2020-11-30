import assert from 'power-assert';

import ApplicationError from '../application-error';
import fileSystem from '../file-system';
import { mockCommand } from '../../test/child-process-mock';
import CommandService from './command-service';
import ImageService from './image-service';

import { findS3Object } from '../../test/resources';

const gif = findS3Object('gif', { local: true });
const jpeg = findS3Object('jpeg', { local: true });
const png = findS3Object('png', { local: true });

describe('ImageService', () => {
  const fileId = '337bf1d9-e41a-4208-9d4c-9cfb0f52f3a8';

  describe('.resize', () => {
    const outputPath = `/tmp/${fileId}.jpg`;

    afterEach(async () => {
      await fileSystem.clear();
    });

    async function assertCommandError(inputPath: string, outputPath: string, options = {}): Promise<void> {
      try {
        await ImageService.resize(inputPath, outputPath, options);

        throw new Error('Expected error not occurred');
      } catch (e) {
        if (!(e instanceof ApplicationError)) {
          assert.fail(e.message);
        }

        assert.equal(e.code, 'CommandError');
      }
    }

    function assertJPEG(path: string, width: number, height: number, progressive: boolean, quality?: number, stripped?: boolean): Promise<void> {
      const command = `identify -format "%m\n%[fx:w]x%[fx:h]\n%[interlace]\n%Q\n%[EXIF:*]" ${path}`;

      return CommandService.run(command, (output) => {
        const lines = output.split("\n");

        assert.equal(lines[0], 'JPEG');
        assert.equal(lines[1], `${width}x${height}`);

        if (typeof progressive === 'boolean') {
          assert.equal(lines[2], progressive ? 'JPEG' : 'None');
        }

        if (typeof quality === 'number') {
          assert.equal(+lines[3] <= quality, true);
        }

        if (typeof stripped === 'boolean') {
          const exif = lines.slice(4, -1);
          assert.equal(exif.length === 0, stripped);
        }
      });
    }

    function testFHDImage(inputPath: string, withExifOrientation = false): void {
      context('and the specified size is less than both side lengths', () => {
        const size = 128;

        context(`and type is 'fit'`, () => {
          it('creates a converted image whose length of the longer side equals the specified value', async () => {
            await ImageService.resize(inputPath, outputPath, { autoOrient: true, quality: 100, size, type: 'fit' });
            await assertJPEG(outputPath, 128, 72, true, 100, withExifOrientation ? false : void 0);
          });
        });

        context(`and type is 'fill'`, () => {
          it('creates a converted image whose length of the shorter side equals the specified value', async () => {
            await ImageService.resize(inputPath, outputPath, { autoOrient: true, progressive: false, strip: true, size, type: 'fill' });
            await assertJPEG(outputPath, 228, 128, false, void 0, withExifOrientation ? true : void 0);
          });
        });
      });

      context('and the specified size is less than the length of the longer side', () => {
        const size = 1440;

        context(`and type is 'fit'`, () => {
          it('creates a converted image whose length of the longer side equals the specified value', async () => {
            await ImageService.resize(inputPath, outputPath, { strip: true, quality: 70, size, type: 'fit' });

            const width = withExifOrientation ? 810 : 1440;
            const height = withExifOrientation ? 1440 : 810;

            await assertJPEG(outputPath, width, height, true, 70, withExifOrientation ? true : void 0);
          });
        });

        context(`and type is 'fill'`, () => {
          it('creates a converted image whose dimension is same as the input', async () => {
            await ImageService.resize(inputPath, outputPath, { progressive: false, size, type: 'fill' });

            const width = withExifOrientation ? 1080 : 1920;
            const height = withExifOrientation ? 1920 : 1080;

            await assertJPEG(outputPath, width, height, false, void 0, withExifOrientation ? false : void 0);
          });
        });
      });

      context('and the specified size is larger than both side lengths', () => {
        const size = 2560;

        context(`and type is 'fit'`, () => {
          it('creates a converted image whose dimension is same as the input', async () => {
            await ImageService.resize(inputPath, outputPath, { progressive: false, size, type: 'fit' });

            const width = withExifOrientation ? 1080 : 1920;
            const height = withExifOrientation ? 1920 : 1080;

            await assertJPEG(outputPath, width, height, false, void 0, withExifOrientation ? false : void 0);
          });
        });

        context(`and type is 'fill'`, () => {
          it('creates a converted image whose dimension is same as the input', async () => {
            await ImageService.resize(inputPath, outputPath, { autoOrient: true, strip: true, size, quality: 70, type: 'fill' });
            await assertJPEG(outputPath, 1920, 1080, true, 70, withExifOrientation ? true : void 0);
          });
        });
      });
    }

    context('when convert command is not installed', () => {
      let execStub: sinon.SinonStub;

      beforeEach(() => {
        execStub = mockCommand(/^convert /i, (process) => {
          process.stderr?.emit('data', '/bin/sh: convert: command not found');
          process.emit('exit', 127, null);
        });
      });

      afterEach(() => {
        execStub?.restore();
      });

      it('throws CommandError', async () => { await assertCommandError(jpeg.local as string, outputPath); });
    });

    context('when the input file is JPEG', () => { testFHDImage(jpeg.local as string, true); });

    context('when the input file is PNG', () => { testFHDImage(png.local as string, false); });
  });

  describe('.resizeAnimation', function() {
    this.timeout(20000); // GIFの変換が2秒で終わらないので延長
    const outputPath = `/tmp/${fileId}.gif`;

    afterEach(async () => {
      await fileSystem.clear();
    });

    async function assertCommandError(inputPath: string, outputPath: string, options = {}): Promise<void> {
      try {
        await ImageService.resize(inputPath, outputPath, options);

        throw new Error('Expected error not occurred');
      } catch (e) {
        if (!(e instanceof ApplicationError)) {
          assert.fail(e.message);
        }

        assert.equal(e.code, 'CommandError');
      }
    }

    // TODO: 背景色等の確認
    async function assertGIF(path: string, frame: number, width: number, height: number): Promise<void> {
      const command = `identify -format "%m %[fx:w]x%[fx:h]\n" ${path}`

      await CommandService.run(command, (output) => {
        const lines = output.split("\n").slice(0, -1);

        assert.equal(lines.length, frame);
        assert.equal(lines[0].startsWith('GIF'), true);
      });

      const dimension = await ImageService.detectDimension(path);

      assert.equal(dimension.width, width);
      assert.equal(dimension.height, height);
    }

    context('when convert command is not installed', () => {
      let execStub: sinon.SinonStub;

      beforeEach(() => {
        execStub = mockCommand(/^convert /i, (process) => {
          process.stderr?.emit('data', '/bin/sh: convert: command not found');
          process.emit('exit', 127, null);
        });
      });

      afterEach(() => {
        execStub?.restore();
      });

      it('throws CommandError', async () => { await assertCommandError(gif.local as string, outputPath); });
    });

    context('when the input file is GIF', () => {
      const inputPath = gif.local as string;

      context('and the specified size is less than both side lengths', () => {
        const size = 160;

        context(`and type is 'fit'`, () => {
          it('creates a converted image whose length of the longer side equals the specified value', async () => {
            await ImageService.resizeAnimation(inputPath, outputPath, { size, type: 'fit' });
            await assertGIF(outputPath, 12, 160, 90);
          });
        });

        context(`and type is 'fill'`, () => {
          it('creates a converted image whose length of the shorter side equals the specified value', async () => {
            await ImageService.resizeAnimation(inputPath, outputPath, { size, type: 'fill' });
            await assertGIF(outputPath, 12, 284, 160);
          });
        });
      });

      context('and the specified size is less than the length of the longer side', () => {
        const size = 720;

        context(`and type is 'fit'`, () => {
          it('creates a converted image whose length of the longer side equals the specified value', async () => {
            await ImageService.resizeAnimation(inputPath, outputPath, { size, type: 'fit' });
            await assertGIF(outputPath, 12, 720, 405);
          });
        });

        context(`and type is 'fill'`, () => {
          it('creates a converted image whose dimension is same as the input', async () => {
            await ImageService.resizeAnimation(inputPath, outputPath, { size, type: 'fill' });
            await assertGIF(outputPath, 12, 1200, 675);
          });
        });
      });

      context('and the specified size is larger than both side lengths', () => {
        const size = 1280;

        context(`and type is 'fit'`, () => {
          it('creates a converted image whose dimension is same as the input', async () => {
            await ImageService.resizeAnimation(inputPath, outputPath, { size, type: 'fit' });
            await assertGIF(outputPath, 12, 1200, 675);
          });
        });

        context(`and type is 'fill'`, () => {
          it('creates a converted image whose dimension is same as the input', async () => {
            await ImageService.resizeAnimation(inputPath, outputPath, { size, type: 'fill' });
            await assertGIF(outputPath, 12, 1200, 675);
          });
        });
      });
    });
  });

  describe('.detectDimension', () => {
    async function assertCommandError(inputPath: string): Promise<void> {
      try {
        await ImageService.detectDimension(inputPath);

        throw new Error('Expected error not occurred');
      } catch (e) {
        if (!(e instanceof ApplicationError)) {
          assert.fail(e.message);
        }

        assert.equal(e.code, 'CommandError');
      }
    }

    async function assertDimension(path: string, width: number, height: number): Promise<void> {
      const dimension = await ImageService.detectDimension(path);

      assert.equal(dimension.width, width);
      assert.equal(dimension.height, height);
    }

    afterEach(async () => {
      await fileSystem.clear();
    });

    context('when identify command is not installed', () => {
      let execStub: sinon.SinonStub;

      beforeEach(() => {
        execStub = mockCommand(/^identify /i, (process) => {
          process.stderr?.emit('data', '/bin/sh: identify: command not found');
          process.emit('exit', 127, null);
        });
      });

      afterEach(() => {
        execStub?.restore();
      });

      it('throws CommandError', async () => { await assertCommandError(jpeg.local as string); });
    });

    context('when the input file is JPEG', () => {
      // EXIFで回転してある
      it('returns its dimension', async () => { await assertDimension(jpeg.local as string, 1080, 1920); });
    });

    context('when the input file is PNG', () => {
      it('returns its dimension', async () => { await assertDimension(png.local as string, 1920, 1080); });
    });

    context('when the input file is GIF', () => {
      it('returns its dimension', async () => { await assertDimension(gif.local as string, 1200, 675); });
    });
  });
});
