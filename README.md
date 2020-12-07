# Thumbnail Generator Lambda
PDFのプレビュー生成、および画像のサムネイル生成処理を行うLambda Function

## Requirements
実行、リリースには[Serverless framework](https://www.serverless.com/)を使用するため、[Credentials](https://www.serverless.com/framework/docs/providers/aws/guide/credentials/)など必要な設定をしておく必要がある.

また、以下のソフトウェアを使用するため、それぞれ実行環境にインストールしておくこと.
- Ghostscript
- ImageMagick
- poppler

Lambda上では、以下のLayerを使用するため、これらも予めリリースしておく必要がある.
- [ghostscript-aws-lambda-layer](https://github.com/BearTail/ghostscript-aws-lambda-layer)
- [image-magick-aws-lambda-layer](https://github.com/BearTail/image-magick-aws-lambda-layer)
- [poppler-aws-lambda-layer](https://github.com/BearTail/poppler-aws-lambda-layer)

## Specification
S3の特定のprefixに関して、S3 Objectが作成・更新された時に、SNSのトピックにイベントが通知される.\
このイベントをトリガーとして、以下のFunctionが実行される.

### PDFのプレビュー生成
PDFのプレビューをGhostscriptを使って生成する.

1. アップロードされたファイルをダウンロード
  - 画像ファイルの場合は処理を終了
2. 1のファイルを `gs` コマンドを使ってJPEGに変換する
3. 2で作成されたファイルをアップロードする
  - 同じprefixでアップロードされることにより、次の画像のサムネイル生成処理が実行される

### 画像のサムネイル生成
画像のサムネイルをImageMagickを使って生成する.

1. アップロードされたファイルをダウンロード
  - PDFファイルの場合は処理を終了
2. 1のファイルから、EXIF等のメタデータを除去した画像ファイルを作成する
  - JPEG, PNGの場合はJPEG、GIFの場合はGIFを、縮尺を維持したまま作成する
  - 長辺は最大で3840px以下にする
3. 2で作成されたファイルをアップロードする
4. 2で作成されたファイルを元に、サムネイル画像を作成する（画像のサイズは、長辺が128pxのもの、短辺が512pxのものの2種類）
  - JPEG, PNG: 5MBに収まるように変換
  - GIF: 背景色を白にして、容量を最適化したGIFを生成
5. 4で生成されたファイルを順次アップロードする

## Usage
### Command
```sh
# ローカル実行
yarn start

# リモート実行
env S3_BUCKET=test S3_OBJECT_KEY=key.jpg yarn start:remote -f generate-thumbnails

# serverlessコマンドのオプションを使用可能
# 詳細はドキュメントを参照（https://www.serverless.com/framework/docs/）
env S3_BUCKET=test S3_OBJECT_KEY=key.jpg yarn start:remote -f generate-thumbnails --stage prod --region us-east-1

# テスト
yarn run test

# E2Eテスト（ただし、特定のkeyでファイルがアップロードされている必要がある. 詳細は `test/data/index.json` を参照）
S3_BUCKET=your-bucket S3_OBJECT_PREFIX=prefix yarn test:e2e:staging
```

## Release
```sh
# サービス全体のリリース
# デフォルトで ap-northeast-1 にリリースされる
yarn release

# Lambda Functionのコード修正のみのリリース
yarn release -f generate-pdf-preview

# serverlessコマンドのオプションを使用可能
# 詳細はドキュメントを参照（https://www.serverless.com/framework/docs/）
yarn release --stage prod --region us-east-1
```

### Configuration
1. ダウンロード元（＝アップロード先）となるS3バケット

    SNSのトピックの設定の他に、Lambda Functionの権限設定のためにオプションで指定する必要がある.

    ```sh
    # Serverlessコマンドのオプションで指定する
    yarn release --bucket test

    # 複数のバケットを使う場合
    yarn release --bucket test1 --bucket test2
    ```

1. サムネイルのアップロード先

    生成されたサムネイルは、元のファイルと同じバケットにアップロードされるが、prefixを変更することは可能.

    ```sh
    # 環境変数で指定する
    env THUMBNAIL_DESTINATION_PREFIX=dest yarn release
    ```

3. サービス名称
    serverless.ymlのserviceで指定する名称を変更できる.

    ```sh
    # Serverlessコマンドのオプションで指定する
    yarn release --service your-service-name
    ```

## LICENSE
AGPL 3.0

なお、内部で[Ghostscript](https://www.ghostscript.com/), [ImageMagick](https://imagemagick.org/), [Poppler](https://poppler.freedesktop.org/)を使用している.
