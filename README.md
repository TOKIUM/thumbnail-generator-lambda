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
yarn start -f generate-thumbnails

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
    # 環境変数で指定する
    S3_BUCKET_LIST=test yarn release

    # 複数のバケットを使う場合
    S3_BUCKET_LIST=test1,test2 yarn release
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
    # 環境変数で指定する
    SLS_SERVICE=your-service-name yarn release
    ```

4. Lambda Layerのバージョン（ghostscript / poppler）

    `generate-pdf-preview` が使う ghostscript-aws-lambda-layer と poppler-aws-lambda-layer のバージョンは、[config/layer-versions.js](config/layer-versions.js) で stage ごとに固定している.\
    全 stage が同じ AWS アカウントの同じ名前のLayerを使うので、新しいバージョンを publish しても、ここを書き換えない限りどの stage にも入らない.\
    ただし、これはリリース元のすべてのブランチにこの固定が入っていることが前提（下の手順の「前提」を参照）. 固定の入っていないブランチからリリースすると、その時点で最新のLayerが入る.\
    対応表にない stage は `DEFAULT_LAYER_VERSIONS` を使う. 対応表にある stage の行には ghostscript と poppler の両方を書く（片方がないと、デプロイがエラーで止まる）.

    ```sh
    # 手動で検証するときは、環境変数で一時的に上書きできる（対応表より優先される）
    GHOSTSCRIPT_LAYER_VERSION=5 POPPLER_LAYER_VERSION=7 yarn release:staging
    ```

    新しいバージョンに切り替える手順:

    前提（publish の前）: 固定（config/layer-versions.js）が、リリース元のブランチ develop・main・dev-tk・dev-ti・dev-td・dev-etc のすべてに入っていること.\
    固定はブランチごとのコードに入っているので、効くのはこの固定を含むブランチからのリリースだけ. [release.yml](../../.github/workflows/release.yml) は、develop（staging = stage `dev`）・main（`prod`）のほか、dev-tk / dev-ti / dev-td / dev-etc への push（と workflow_dispatch）でも、それぞれの stage にリリースする.

    ```sh
    # 各ブランチに config/layer-versions.js があるかを見る（--full-tree を付けているので、どのディレクトリで実行してもよい）
    git fetch origin
    for branch in develop main dev-tk dev-ti dev-td dev-etc; do
      if ! git rev-parse --verify --quiet "origin/${branch}" > /dev/null; then
        echo "${branch}: ブランチなし"
      elif git ls-tree --full-tree --name-only "origin/${branch}" packages/receipt-thumbnails/config/layer-versions.js | grep -q .; then
        echo "${branch}: OK"
      else
        echo "${branch}: 入っていない"
      fi
    done
    ```

    入っていないブランチがあれば、publish の前にそのブランチへ入れるか、そのブランチからリリースしないことを周知する.\
    「ブランチなし」のブランチは、作ったときの push でリリースが走るので、固定を含むコミットから作る.\
    固定より前のコミットからのリリース（古いワークフローの re-run や、古い checkout からの `yarn release`）も、publish のあとは行わない.

    1. 各Layerのリポジトリで新しいバージョンを publish し、バージョン番号を確認する.\
        ghostscript と poppler は続けて publish する（間に固定の入っていないリリースが走ると、片方だけ新しいバージョンが入るおそれがある）
    2. `STAGE_LAYER_VERSIONS` の `dev`（staging）の行だけを新しいバージョンにして develop にマージし（staging にリリースされる）、確認する
        ```js
        dev: { ghostscript: 5, poppler: 7 }, // staging
        ```
        e2e はレスポンスが `s3://` で始まるかしか見ない. pdfinfo が失敗しても `-g` なしで変換を続けるので、プレビューが 90 度回転していても、pdfinfo が起動しなくても e2e は通る. そのため、次を人の目で確かめる.
        - リリースのログ（release ワークフローの `Release receipt-thumbnails (staging)`）で、使ったバージョンを見る.\
            `ghostscript-aws-lambda-layer: version=5, description=Ghostscript v...` の行で、Layerに入っている版も分かる
            ```
            Using ghostscript layer version 5 (stage=dev, config/layer-versions.js)
            Using poppler layer version 7 (stage=dev, config/layer-versions.js)
            ```
        - 横向きの PDF のプレビュー画像を実際に開き、横長で、文字が正しい向きになっていることを目で見る.\
            e2e（e2e ワークフローを package: `receipt-thumbnails`、environment: `dev` で実行する. 手元からなら、`scripts/seed-e2e-fixtures.sh` で素材を seed したうえで `yarn test:e2e:staging`）は、test/data/landscape-2p.pdf（842 x 595 pts）のプレビューを `s3://${S3_BUCKET}/${S3_OBJECT_PREFIX}/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-5000000000b2.jpeg` に出力する
        - generate-pdf-preview のログ（CloudWatch Logs の `/aws/lambda/<サービス名>-dev-generate-pdf-preview`. サービス名は serverless.yml の `service`）で、pdfinfo が動いていることを見る
            - `error while loading shared libraries`（pdfinfo が起動しない）、`command=pdfinfo` を含む `command exited with code ...`（`CommandError`）、`Failed to detect the page size` が出ていない
            - landscape-2p.pdf なら、`Page size = 842x595 pts` が出ていて、gs の `Command finished successfully (gs ...)` に `-g3508x2480` が付いている（`Page size` は verbose のログ. [webpack.config.js](webpack.config.js) で `LOG_LEVEL` を staging は `debug`、本番は `verbose` にしているので、どちらでも出る）
            - `Command finished successfully (pdfinfo ...)` は pdfinfo が失敗しても出るので、目安にならない
    3. 問題なければ、`prod` などほかの stage の行も新しいバージョンにする.\
        stage が上がるのは、その stage のリリース元ブランチ（`prod` なら main、dev-* なら各 dev-* ブランチ）に対応表の変更が入ってリリースされたとき
    4. すべての stage を上げたら、`DEFAULT_LAYER_VERSIONS` も新しいバージョンにする

    ghostscript と poppler は、同じ stage で同時に上げること（Ghostscript 10 系は、pdfinfo が使えないと横向きの PDF を 90 度回転して描画するため）.\
    image-magick-aws-lambda-layer は、今のところデプロイ時点で最新のバージョンを使う（`IMAGE_MAGICK_LAYER_VERSION` で指定できる）.

## LICENSE
AGPL 3.0

なお、内部で[Ghostscript](https://www.ghostscript.com/), [ImageMagick](https://imagemagick.org/), [Poppler](https://poppler.freedesktop.org/)を使用している.
