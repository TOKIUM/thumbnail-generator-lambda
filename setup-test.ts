import { stub } from 'sinon';
import logger from './src/logger';

// テスト環境でログ出力しない
stub(logger, 'debug');
stub(logger, 'verbose');
stub(logger, 'info');
stub(logger, 'warn');
stub(logger, 'error');
