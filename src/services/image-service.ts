import ApplicationError from '../application-error';
import CommandService from './command-service';
import ErrorCode from '../error-code';
import fileSystem from '../file-system';
import logger from '../logger';

export const previewSizes = [128, 512];

type ResizeType = 'fit' | 'fill';

interface JPEGOptions {
  autoOrient?: boolean;
  progressive?: boolean;
  quality?: number;
  strip?: boolean;
  size?: number;
  type?: ResizeType;
}

interface GIFOptions {
  backgroundColor?: string;
  size?: number;
  type?: ResizeType;
}

interface Dimension {
  width: number;
  height: number;
}

/**
 * ImageMagickを実行する
 */
export default class ImageService {
  /**
   * 画像を縮小する.
   * 指定のパラメータで変換すると画像のサイズが大きくなる場合は、サイズは変更せずに出力する.
   *
   * @param options.autoOrient - trueの時、EXIFのOrientationを参照して画像の向きを変更する
   * @param options.progressive - trueの時、Progressive JPEGを生成する
   * @param options.size - 画像の辺のpixel. 未指定の時は許容する最大サイズ（3840px）.
   * @param options.strip - trueの時、メタデータを除去する
   * @param options.type - `fit` の時は長辺、`fill` の時は短辺を指定sizeに合わせる
   */
  static async resize(inputPath: string, outputPath: string, options: JPEGOptions = {}): Promise<void> {
    const {
      autoOrient = false, progressive = true, strip = false,
      quality, size = 3840, type = 'fit',
    } = options;

    let command = `convert ${inputPath} -limit memory 2880MB -format JPEG`;

    if (quality) {
      command += ` -quality ${quality}`;
    }

    // 容量の上限を設定する（500KB or 5MB）
    const extent = size > 512 ? '5MB' : '500KB';
    command += ` -define jpeg:extent=${extent}`;

    if (autoOrient) {
      command += ' -auto-orient';
    }

    if (progressive) {
      command += ' -interlace JPEG';
    }

    if (strip) {
      command += " +profile '!icc,*'"; // EXIF等除去
    }

    if (size) {
      const resizeOption = await this.buildResizeOption(inputPath, size, type);

      if (resizeOption) {
        command += ` ${resizeOption}`;
      }
    }

    return fileSystem.writeBy(`${command} ${outputPath}`, [outputPath]);
  }

  static async resizeAnimation(inputPath: string, outputPath: string, options: GIFOptions = {}): Promise<void> {
    const { backgroundColor = 'White', size = 960, type = 'fit' } = options;

    let command = `convert ${inputPath} -limit memory 2880MB -coalesce -bordercolor ${backgroundColor} -border 0`;

    if (size) {
      const resizeOption = await this.buildResizeOption(inputPath, size, type);

      if (resizeOption) {
        command += ` ${resizeOption}`;
      }
    }

    command += ` -layers OptimizePlus`;

    return fileSystem.writeBy(`${command} ${outputPath}`, [outputPath]);
  }

  /**
   * 画像の縦・横のサイズを返す.
   * NOTE: EXIFのOrientationは考慮されない.
   */
  static async detectDimension(inputPath: string): Promise<Dimension> {
    const command = `identify -format "%[fx:w]x%[fx:h]\n" ${inputPath}`;

    return CommandService.run(command, (output) => {
      const lines = output.split("\n").slice(0, -1); // GIFの場合、フレームごとに出力される

      return lines.reduce((acc, line) => {
        const matched = line.match(/(\d+)x(\d+)/);

        if (!matched) {
          throw new ApplicationError(ErrorCode.DimensionUnidentified, `Failed to parse dimension (${output})`);
        }

        const width = +matched[1];
        const height = +matched[2];

        logger.debug(`The dimension of the frame is ${width}x${height}`);

        return { width: Math.max(acc.width, width), height: Math.max(acc.height, height) };
      }, { width: 0, height: 0 });
    });
  }

  private static async buildResizeOption(inputPath: string, size: number, type: ResizeType): Promise<string | null> {
    if (type === 'fit') {
      return `-resize '${size}x${size}>'`;
    }

    // 指定のサイズより画像が小さい時に、サイズを変更しないオプションがおそらく存在しないので、自力で判定する.
    // サイズ検出に失敗した場合、変換処理を構わず続行して良いと思われるが、正常にconvertが実行できる気もしないのでエラーにする.
    const dimension = await this.detectDimension(inputPath);

    logger.debug(`The image size is ${dimension.width}x${dimension.height}`);

    if (dimension.width <= size || dimension.height <= size) {
      return null;
    }

    return `-resize '${size}x${size}^'`;
  }
}
