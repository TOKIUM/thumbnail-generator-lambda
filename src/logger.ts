import Bugsnag from '@bugsnag/js';
import { NodeConfig } from '@bugsnag/node';

import * as winston from 'winston';
import { LEVEL, MESSAGE } from 'triple-beam';

// 出力にLambdaのrequestIdが付与されないので、Consoleを書き換える
class LambdaConsole extends winston.transports.Console {
  public consoleWarnLevels: string[] = []; // 実際は、constructorで初期化されている

  log(info: winston.LogEntry, callback: Function): void { // eslint-disable-line @typescript-eslint/ban-types
    setImmediate(() => { this.emit('logged', info); });

    /* eslint-disable @typescript-eslint/no-explicit-any */

    // TypeScriptの制約により、正しく型付けできないので、anyを使う. TS4.4で修正予定
    // https://github.com/microsoft/TypeScript/issues/1863
    if (this.stderrLevels[info[LEVEL as any]]) {
      console.error(info[MESSAGE as any]);
    } else if (this.consoleWarnLevels[info[LEVEL as any]]) {
      console.warn(info[MESSAGE as any]);
    } else {
      console.log(info[MESSAGE as any]);
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (callback) { callback(); }
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
  ),
  transports: [
    new LambdaConsole({
      format: winston.format.simple(),
    }),
  ],
});

logger.on('error', () => {
  // 何もしない
});

type BugsnagMetadata = { [key: string]: object };  // eslint-disable-line @typescript-eslint/ban-types
type MetadataBuilder<T> = (event: T, context?: AWSLambda.Context) => BugsnagMetadata;
type DKLambdaHandler<T, U> = (event: T, context?: AWSLambda.Context, callback?: AWSLambda.Callback<U>) => Promise<U>;

export function applyBugsnag<T, U>(handler: DKLambdaHandler<T, U>, config?: Partial<NodeConfig>, metadataBuilder?: MetadataBuilder<T>): DKLambdaHandler<T, U> {
  Bugsnag.start({
    apiKey: process.env.BUGSNAG_API_KEY || '0123456789abcdef0123456789abcdef',
    releaseStage: process.env.NODE_ENV || 'development',
    appVersion: process.env.APP_VERSION,
    ...(config || {}),
  });

  return async (event, context, callback) => {
    const metadataKeys: string[] = [];

    try {
      const metadata: BugsnagMetadata = {
        context: { ...context }, // NOTE: Lambdaの関数名やログストリーム名などが入る
        ...(metadataBuilder ? metadataBuilder(event, context) : {}),
      };

      Object.keys(metadata).forEach((key) => {
        metadataKeys.push(key);
        Bugsnag.addMetadata(key, metadata[key]);
      });

      return await handler(event, context, callback);
    } catch (e) {
      // awaitしないと、送信処理完了前にLambdaの実行が終了する可能性がある
      await new Promise<void>((resolve) => {
        if (process.env.NODE_ENV == 'test') {
          // テスト時のエラーは無視
          resolve();
          return;
        }

        Bugsnag.notify(e, void 0, (err) => {
          logger.error(err);
          resolve();
        });
      });

      throw e;
    } finally {
      metadataKeys.forEach((key) => {
        Bugsnag.clearMetadata(key);
      });
    }
  };
}
export default logger;
