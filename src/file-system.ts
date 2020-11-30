import * as fs from 'fs';
import { exec } from 'child_process';

import ApplicationError from './application-error';
import ErrorCode from './error-code';
import logger from './logger';

export type Encoding = 'ascii' | 'utf8' | 'utf-8' | 'utf16le' | 'ucs2' | 'ucs-2' | 'base64' | 'latin1' | 'binary' | 'hex';

/**
 * 一時ファイルの状態を管理するため、fsによる読み込み、書き込み処理をラップする
 */
class FileSystem {
  private _files: string[] = [];

  get files(): string[] {
    return this._files;
  }

  pushFiles(paths: string[]): void {
    paths.forEach((path) => {
      if (!this.files.includes(path)) {
        this._files.push(path);
      }
    });
  }

  writeFile(path: string, data: string | Buffer | Uint8Array, options: { encoding?: Encoding } = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.writeFile(path, data, options, (error) => {
        if (error) {
          logger.error(`Failed to write to ${path}`);
          reject(error);
        } else {
          this.pushFiles([path]);
          resolve();
        }
      });
    });
  }

  /**
   * コマンド実行によりファイルが出力される時に、出力されるファイルを登録する.
   * 実際に指定されたファイルが出力されたかどうかはチェックされないので注意.
   *
   * @param command - 実行するコマンド
   * @param paths - commandによって作成されるファイルのリスト
   */
  writeBy(command: string, paths: string[] = []): Promise<void> {
    this.pushFiles(paths);

    return new Promise((resolve, reject) => {
      logger.verbose(`Executing command (${command})`);
      const process = exec(`${command}`);

      process.stdout?.on('data', (data) => { logger.debug(data); });
      process.stderr?.on('data', (data) => { logger.error(data); });

      process.on('exit', (code, signal) => {
        if (code === 0) {
          logger.info(`Command finished successfully (${command})`);
          resolve();
        } else {
          reject(new ApplicationError(ErrorCode.CommandError, `command exited with code ${code} (signal=${signal}, command=${command})`));
        }
      });
    });
  }

  createReadStream(path: string, options?: string | { encoding?: Encoding }): fs.ReadStream {
    if (!this.files.includes(path)) {
      logger.error(`Reading an invalid file (path=${path}, valid paths=${this.files.join(',')})`);
      throw new ApplicationError(ErrorCode.IOError, `File path invalid (path=${path})`);
    }

    return fs.createReadStream(path, options);
  }

  createWriteStream(path: string, options?: string | { encoding?: Encoding }): fs.WriteStream {
    const stream = fs.createWriteStream(path, options);
    stream.on('pipe', () => { this.pushFiles([path]) });
    stream.on('open', () => { this.pushFiles([path]) });

    return stream;
  }

  clear(): Promise<string[]> {
    const deletedFiles: string[] = [];

    if (this.files.length === 0) {
      return Promise.resolve([]);
    }

    logger.debug(`Removing temporary files... (paths=${this.files.join(',')})`);

    return Promise.all(this.files.map((filePath) => {
      return new Promise<string>((resolve, reject) => {
        fs.unlink(filePath, (error) => {
          // エラーが起きても、ファイルが存在しない場合は無視する
          if (error && fs.existsSync(filePath)) {
            reject(error);
            return;
          }

          deletedFiles.push(filePath);
          resolve(filePath);
        });
      });
    })).then((filePaths) => {
      logger.info('Removed temporary files');

      return filePaths;
    }).finally(() => {
      this._files = this.files.filter((x) => (!deletedFiles.includes(x)));
    });
  }
}

export default new FileSystem();
