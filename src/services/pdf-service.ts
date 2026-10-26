import * as fs from 'fs';

import ApplicationError from '../application-error';
import CommandService from './command-service';
import ErrorCode from '../error-code';
import fileSystem from '../file-system';
import logger from '../logger';

interface PageSize {
  width: number;
  height: number;
}

const INCH_TO_POINT = 72; // 1 inch = 72 point

/**
 * PDFのプレビューを作成する
 */
export default class PdfService {
  static async convert(pdfPath: string, jpegPath: string): Promise<void> {
    const dpi = 300;
    let command = `gs -dQUIET -dBATCH -dNOPAUSE -dJPEGQ=100 -r${dpi} -sDEVICE=jpeg -sPageList=1 -dPDFFitPage`;
    let pageSize = null;

    try {
      pageSize = await this.getPreviewSize(pdfPath, dpi);
    } catch (error) {
      logger.error(error);
    }

    if (pageSize != null) {
      command += ` -g${pageSize.width}x${pageSize.height}`;
    }

    command += ` -o ${jpegPath} ${pdfPath}`;

    await fileSystem.writeBy(command, [jpegPath]);

    // gs は、閲覧パスワード付きのPDF（10系）や、空・壊れたPDFで、何も出力せずに exit 0 で終わることがある
    const outputSize = await fs.promises.stat(jpegPath).then((stats) => stats.size, () => 0);

    if (outputSize === 0) {
      throw new ApplicationError(
        ErrorCode.CommandError,
        `gs exited with code 0 but the output is missing or empty (path=${jpegPath}). The PDF may be encrypted, empty or broken (command=${command})`,
      );
    }
  }

  static async getPreviewSize(pdfPath: string, dpi: number): Promise<PageSize | null> {
    const pageSize = await this.getPageSize(pdfPath);

    if (!pageSize) { return null; }

    const maxSize = Math.max(pageSize.width, pageSize.height);
    const ratio = Math.min(1, 842 / maxSize); // およそ、A4の長辺ぐらいを最大値とする
    const widthPx = pageSize.width * ratio * dpi / INCH_TO_POINT;
    const heightPx = pageSize.height * ratio * dpi / INCH_TO_POINT;

    return {
      width: widthPx < heightPx ? Math.ceil(widthPx) : Math.floor(widthPx),
      height: widthPx < heightPx ? Math.floor(heightPx) : Math.ceil(heightPx),
    };
  }

  private static async getPageSize(pdfPath: string): Promise<PageSize | null> {
    const command = `pdfinfo ${pdfPath}`;

    return CommandService.run(command, (output) => {
      const pageSizeLine = output.split(`\n`).find((line) => (line.startsWith('Page size'))) || '';
      const matched = pageSizeLine.match(/:\s*([\d.]+) x ([\d.]+) pts/); // `Page size:      595.22 x 842 pts (A4)` のような出力

      if (!matched) {
        logger.warn(`Failed to detect the page size (path=${pdfPath})`);
        logger.debug(`pdfinfo output: ${output}`);
        return null;
      }

      const width = +matched[1];
      const height = +matched[2];
      logger.verbose(`Page size = ${width}x${height} pts`);

      return { width, height };
    });
  }
}
