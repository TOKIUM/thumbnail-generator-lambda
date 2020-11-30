import { exec } from 'child_process';

import ApplicationError from '../application-error';
import ErrorCode from '../error-code';
import logger from '../logger';

export default class CommandService {
  static async run<T>(command: string, callback: (output: string) => T): Promise<T> {
    return new Promise((resolve, reject) => {
      logger.verbose(`Executing command (${command})`);
      const process = exec(command);

      const output: string[] = [];

      process.stderr?.on('data', (data) => { logger.error(data); });
      process.stdout?.on('data', (data) => { output.push(data); });
      process.stdout?.on('end', () => {
        // exitの時点で出力がflushされていない可能性があるため、ここでresolveする.
        try {
          const result = callback(output.join(''));
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      process.stdout?.on('error', (error) => {
        // exitで必ずしも処理を抜けられないため、stdoutのエラーも処理する必要がある.
        reject(new ApplicationError(ErrorCode.IOError, `command output error (${error.message})`));
      });

      process.on('exit', (code, signal) => {
        if (code !== 0) {
          reject(new ApplicationError(ErrorCode.CommandError, `command exited with code ${code} (signal=${signal}, command=${command})`));
        }

        logger.info(`Command finished successfully (${command})`);
      });
    });
  }
}