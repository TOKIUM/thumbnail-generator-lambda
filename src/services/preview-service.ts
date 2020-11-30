import S3Object from '../aws/s3/object';
import PdfService from './pdf-service';
import ImageService, { previewSizes } from './image-service';

export default class PreviewService {
  /**
   * PDFのプレビュー画像を作成し、S3にアップロードする.
   *
   * @param s3Object - 元となるPDFファイル.
   * @return プレビュー画像のS3 Object
   */
  static async createPdfPreview(s3Object: S3Object): Promise<S3Object> {
    const previewPath = `/tmp/${s3Object.baseName}.jpg`;

    return PdfService.convert(s3Object.filePath, previewPath).then(() => {
      const previewObject = new S3Object(s3Object.bucket, this.getPdfPreviewKey(s3Object.key), previewPath, 'image/jpeg');

      return previewObject.save().then(() => (previewObject));
    });
  }

  static getPdfPreviewKey(key: string): string {
    // 拡張子が.pdf（ignoring case）の時 -> key から拡張子を取り除いた文字列に '.jpeg' を付加
    // それ以外の拡張子 or 拡張子なしのPDFファイルのとき -> key に '.jpeg' を付加
    return /\.pdf$/i.test(key) ? key.replace(/\.pdf$/i, '.jpeg') : `${key}.jpeg`;
  }

  /**
   * サムネイル画像を作成する.
   * 入力となるS3 Objectは、画像ファイルである必要がある.
   *
   * @param s3Object - サムネイルを作成する対象となる画像ファイル. MIMETypeは、 image/gif, image/jpeg, image/png のいずれか.
   * @param sizes - 作成するサムネイルのサイズのリスト.
   */
  static async createThumbnails(s3Object: S3Object, sizes: readonly number[] = previewSizes): Promise<Array<[number, S3Object]>> {
    const baseImage = await this.createBaseImage(s3Object);
    const promises: Promise<[number, S3Object]>[] = sizes.map((size) => {
      // TODO: 使用メモリが上限をが超えることがあったら、処理を直列に変更する
      return this.createPreview(s3Object, baseImage.filePath, size);
    });

    return Promise.all(promises).then((previews) => {
      return ([[0, baseImage] as [number, S3Object]]).concat(previews);
    });
  }

  static getThumbnailPath(s3Object: S3Object, size: number): string {
    const baseName = size ? `${s3Object.baseName}-${size}` : s3Object.baseName;
    const fileName = s3Object.isGif ? `${baseName}.gif` : `${baseName}.jpg`;

    // TODO: テスト時などに外部から値を設定できるように
    return `${process.env.THUMBNAIL_DESTINATION_PREFIX}/${s3Object.directory}/${fileName}`;
  }

  static getLocalThumbnailPath(s3Object: S3Object, size: number): string {
    return `/tmp/${s3Object.baseName}-${size}.${s3Object.isGif ? 'gif' : 'jpg'}`;
  }

  private static async createBaseImage(s3Object: S3Object): Promise<S3Object> {
    const imageFilePath = s3Object.isPdf ? `/tmp/${s3Object.baseName}.jpg` : s3Object.filePath;

    const outputPath = this.getLocalThumbnailPath(s3Object, 0);
    const resizePromise = s3Object.isGif ? ImageService.resizeAnimation(imageFilePath, outputPath)
      : ImageService.resize(imageFilePath, outputPath, { autoOrient: true, strip: true });

    return resizePromise.then(() => {
      const contentType = s3Object.isGif ? 'image/gif' : 'image/jpeg';
      const baseImageKey = this.getThumbnailPath(s3Object, 0);
      const baseImageObject = new S3Object(s3Object.bucket, baseImageKey, outputPath, contentType);

      return baseImageObject.save().then(() => (baseImageObject));
    });
  }

  private static createPreview(baseS3Object: S3Object, baseImagePath: string, size: number): Promise<[number, S3Object]> {
    const localPreviewPath = this.getLocalThumbnailPath(baseS3Object, size);
    const type = size > 128 ? 'fill' : 'fit'; // 大きい画像は、表示内容の確認用に使用するため、一辺の長さの最小値を担保する

    const resizePromise = baseS3Object.isGif ? ImageService.resizeAnimation(baseImagePath, localPreviewPath, { size, type })
      : ImageService.resize(baseImagePath, localPreviewPath, { size, type });

    return resizePromise.then(() => {
      const contentType = baseS3Object.isGif ? 'image/gif' : 'image/jpeg';
      const previewKey = this.getThumbnailPath(baseS3Object, size);
      const previewObject = new S3Object(baseS3Object.bucket, previewKey, localPreviewPath, contentType);

      return previewObject.save().then(() => ([size, previewObject]));
    });
  }
}
