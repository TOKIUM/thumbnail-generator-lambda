import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import assert from 'power-assert';
import fileSystem from './file-system';

describe('FileSystem', () => {
  describe('#clear', () => {
    afterEach(async () => {
      await fileSystem.clear();
    });

    context('一時ファイルが登録されている場合', () => {
      let tmpFilePath: string;

      beforeEach(async () => {
        tmpFilePath = path.join(os.tmpdir(), `file-system-test-${Date.now()}-${process.pid}.tmp`);
        await fileSystem.writeFile(tmpFilePath, 'test content');
      });

      it('ディスク上のファイルを削除する', async () => {
        assert(fs.existsSync(tmpFilePath));

        await fileSystem.clear();

        assert(!fs.existsSync(tmpFilePath));
      });

      it('登録済みのファイル一覧をクリアする', async () => {
        await fileSystem.clear();

        assert.deepEqual(fileSystem.files, []);
      });
    });

    context('一時ファイルが登録されていない場合', () => {
      beforeEach(async () => {
        await fileSystem.clear();
      });

      it('空配列を返す', async () => {
        const result = await fileSystem.clear();

        assert.deepEqual(result, []);
      });
    });
  });
});
