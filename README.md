# Thumbnail Generator Lambda
PDFのプレビュー生成、および画像のサムネイル生成処理を行うLambda Function

# NOTE
- 元のファイルと同じバケットにアップロードされる
- 画像とPDFの保存先のprefixは同じでも良い
- PDFのプレビューは画像の保存先にアップロードされる（サムネイル生成処理が実行される）

## Specification
### PDFのプレビュー生成
PDFのプレビューをGhostscriptを使って生成する.

1. アップロードされたファイルをダウンロード
  - 画像ファイルの場合は処理を終了
2. 1のファイルをgsコマンドを使ってJPEGに変換する
3. 2で作成されたファイルをアップロードする

### 画像のサムネイル生成
画像のサムネイルをImageMagickを使って生成する.

1. アップロードされたファイルをダウンロード
  - PDFファイルの場合は処理を終了
2. 1のファイルから、EXIF等のメタデータを除去した画像ファイルでを作成する
  - JPEG, PNGの場合はJPEG、GIFの場合はGIFを、縮尺を維持したまま作成する
  - 長辺は最大で3840px以下にする
3. 2で作成されたファイルをアップロードする
4. 2で作成されたファイルを元に、サムネイル画像を作成する（画像のサイズは、長辺が128のもの、短辺が512のものの2種類）
  - JPEG, PNG: 5MBに収まるように変換
  - GIF: 背景色を白にして、容量を最適化したGIFを生成
5. 4で生成されたファイルを順次アップロードする

## Usage
### Requirements
ローカルで実行する場合は、Ghostscript, ImageMagickをインストールしておくこと.
Lambda上では、 ghostscript-aws-lambda-layer, image-magick-aws-lambda-layerを使用するため、それぞれ予めリリースしておく必要がある.


### Command
TODO: ローカルで使用するコマンドを記載する

## Release
```sh
# サービス全体のリリース
yarn release

# Lambda Functionのコード修正のみのリリース
yarn release -f generate-pdf-preview
```

## LICENSE
AGPL 3.0

なお、内部でGhostscript, ImageMagick, Popplerを使用している.
