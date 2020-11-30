import CommandService from './command-service';
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

    return fileSystem.writeBy(command, [jpegPath]);
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
