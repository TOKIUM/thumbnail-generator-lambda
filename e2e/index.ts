import { describe } from 'mocha';
import { exec, execSync } from 'child_process';
import assert from 'power-assert';
import { findS3Object } from '../test/resources';

const bucket = process.env.S3_BUCKET || 'test';
const prefix = process.env.S3_OBJECT_PREFIX || 'prefix';
const stage = process.env.STAGE || 'dev';
// sls invoke の対象 stage。dev-tk 等のテナント環境を E2E_SLS_STAGE で指定できる（既定は dev/prod）。
const slsStage = process.env.E2E_SLS_STAGE || (stage === 'prod' ? 'prod' : 'dev');

describe('E2E', () => {
  describeGeneratePdfPreview();
  describeGenerateThumbnails();
});

function assertNullResponse(output: string): void {
  // 実行時のログと、レスポンス（null）、最後に改行文字が出力される
  const outputs = output.split('\n');
  assert.equal(outputs.length >= 2, true); // 少なくともnullと改行文字は出力される

  const response = outputs[outputs.length - 2];
  assert.equal(response, 'null');
}

function describeGeneratePdfPreview(): void {
  function assertS3KeyResponse(bucket: string, output: string): void {
    // 実行時のログと、レスポンス（s3のkey）、最後に改行文字が出力される
    const outputs = output.split('\n');
    assert.equal(outputs.length >= 2, true); // 少なくとも、s3 keyと改行文字が出力される

    const response = outputs[outputs.length - 2];
    const s3KeyPattern = new RegExp(`s3://${bucket}/*`);
    assert.equal(s3KeyPattern.test(response), true);
  }

  describe('generate-pdf-preview', function() {
    this.timeout(180 * 1000);
    const command = `yarn run start:remote --stage ${slsStage} -f generate-pdf-preview`;

    context('when the specified object does not exist', () => {
      const s3Key = 'test/key';

      it('returns an error', async () => {
        return new Promise((resolve, reject) => {
          exec(`env S3_BUCKET=${bucket} S3_OBJECT_KEY=${s3Key} ${command}`, (error) => {
            if (!error) {
              reject(new Error('Expected error not occurred'));
              return;
            }

            // TODO: エラーメッセージを評価する
            resolve();
          });
        });
      });
    });

    context('when the specified object is JPEG', () => {
      const { key } = findS3Object('jpeg');

      it('returns null', () => {
        const output = execSync(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`).toString();

        assertNullResponse(output);
      });
    });

    context('when the specified object is PDF', () => {
      const { key } = findS3Object('pdf', { maxSize: 1 * 1000 * 1000 });

      it('returns an S3 key', () => {
        const output = execSync(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`).toString();

        assertS3KeyResponse(bucket, output);
      });
    });

    context('when the specified object is PDF (timestamp)', () => {
      const { key } = findS3Object('pdf', { minSize: 25 * 1000 * 1000 }); // 25MBを超えるPDF

      it('returns an S3 key', () => {
        const output = execSync(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`).toString();

        assertS3KeyResponse(bucket, output);
      });
    });

    // QAエッジ素材（要シード: PREFIX=receipt_images）。複数ページPDFのプレビュー生成。
    context('when the specified object is a multi-page PDF', () => {
      const { key } = findS3Object('pdf', { filter: (o) => (o.description || '').includes('2ページ') });

      it('returns an S3 key', () => {
        const output = execSync(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`).toString();

        assertS3KeyResponse(bucket, output);
      });
    });

    // QAエッジ素材（要シード）。低解像度PDF・横向きPDFでもプレビューが生成される。
    context('when the specified object is a low-resolution PDF', () => {
      const { key } = findS3Object('pdf', { filter: (o) => (o.description || '').includes('低解像度') });

      it('returns an S3 key', () => {
        const output = execSync(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`).toString();

        assertS3KeyResponse(bucket, output);
      });
    });

    context('when the specified object is a landscape PDF', () => {
      const { key } = findS3Object('pdf', { filter: (o) => (o.description || '').includes('横向き2ページ') });

      it('returns an S3 key', () => {
        const output = execSync(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`).toString();

        assertS3KeyResponse(bucket, output);
      });
    });

    // 暗号化(パスワード保護)PDFはプレビュー生成に失敗する。
    context('when the specified object is an encrypted PDF', () => {
      const { key } = findS3Object('pdf', { filter: (o) => (o.description || '').includes('パスワード保護') });

      it('returns an error', async () => {
        return new Promise((resolve, reject) => {
          exec(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`, (error) => {
            if (!error) {
              reject(new Error('Expected error not occurred'));
              return;
            }

            resolve();
          });
        });
      });
    });
  });
}

function describeGenerateThumbnails(): void {
  function assertS3KeyResponse(bucket: string, output: string): void {
    // 実行時のログと、レスポンス（s3のkeyを含むJSON）、最後に改行文字が出力される
    // JSONは、整形された状態で、計5行出力されるはず
    const outputs = output.split('\n');
    assert.equal(outputs.length >= 6, true); // 少なくとも、JSONと改行文字が出力される

    const response = JSON.parse(outputs.slice(outputs.length - 6).join(''));
    const s3KeyPattern = new RegExp(`s3://${bucket}/*`);
    assert.equal('0' in response, true);
    assert.equal('128' in response, true);
    assert.equal('512' in response, true);
    assert.equal(s3KeyPattern.test(response['0']), true);
    assert.equal(s3KeyPattern.test(response['128']), true);
    assert.equal(s3KeyPattern.test(response['512']), true);
  }

  describe('generate-thumbnails', function() {
    this.timeout(300 * 1000);
    const command = `yarn run start:remote --stage ${slsStage} -f generate-thumbnails`;

    context('when the specified object does not exist', () => {
      const s3Key = 'test/key';

      it('returns an error', async () => {
        return new Promise((resolve, reject) => {
          exec(`env S3_BUCKET=${bucket} S3_OBJECT_KEY=${s3Key} ${command}`, (error) => {
            if (!error) {
              reject(new Error('Expected error not occurred'));
              return;
            }

            // TODO: エラーメッセージを評価する
            resolve();
          });
        });
      });
    });

    context('when the specified object is PDF', () => {
      const { key } = findS3Object('pdf');

      it('returns null', () => {
        const output = execSync(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`).toString();

        assertNullResponse(output);
      });
    });

    context('when the specified object is JPEG', () => {
      const { key } = findS3Object('jpeg', { minSize: 3 * 1000 * 1000 }); // 3MBを超えるJPEG (ピクセル数が多い画像)

      it('returns an S3 key', () => {
        const output = execSync(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`).toString();

        assertS3KeyResponse(bucket, output);
      });
    });

    context('when the specified object is PNG (timestamp)', () => {
      const { key } = findS3Object('png', { minSize: 25 * 1000 * 1000 }); // 25MBを超えるPNG

      it('returns an S3 key', () => {
        const output = execSync(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`).toString();

        assertS3KeyResponse(bucket, output);
      });
    });

    // QAエッジ素材（要シード: PREFIX=receipt_images）。スマホ撮影(EXIF回転あり)JPEGのサムネ生成。
    context('when the specified object is a smartphone photo (EXIF orientation)', () => {
      const { key } = findS3Object('jpeg', { filter: (o) => (o.description || '').includes('スマホ撮影') });

      it('returns an S3 key', () => {
        const output = execSync(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`).toString();

        assertS3KeyResponse(bucket, output);
      });
    });

    // QAエッジ素材（要シード）。解像度境界・色調(グレースケール/2階調)・別方位EXIF・極小・低解像度でもサムネ生成される。
    const thumbnailEdgeCases: Array<[string, 'jpeg' | 'png', string]> = [
      ['a resolution-OK boundary JPEG', 'jpeg', '解像度OK境界'],
      ['a resolution-OK boundary PNG', 'png', '解像度OK境界'],
      ['a resolution-NG boundary JPEG', 'jpeg', '解像度NG境界'],
      ['a resolution-NG boundary PNG', 'png', '解像度NG境界'],
      ['a greyscale JPEG', 'jpeg', 'グレースケール'],
      ['a greyscale PNG', 'png', 'グレースケール'],
      ['a bilevel (2-tone) PNG', 'png', '2階調'],
      ['a landscape smartphone photo (EXIF orientation)', 'jpeg', 'Android横'],
      ['a very small JPEG', 'jpeg', '容量が極小'],
      ['a low-resolution JPEG', 'jpeg', '解像度が低い'],
      ['a low-resolution PNG', 'png', '解像度が低い'],
    ];

    thumbnailEdgeCases.forEach(([label, type, descKeyword]) => {
      context(`when the specified object is ${label}`, () => {
        const { key } = findS3Object(type, { filter: (o) => (o.description || '').includes(descKeyword) });

        it('returns an S3 key', () => {
          const output = execSync(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`).toString();

          assertS3KeyResponse(bucket, output);
        });
      });
    });

    // 非画像（不正フォーマット）のサムネ生成はエラーになる。
    context('when the specified object is a non-image (invalid format)', () => {
      const { key } = findS3Object('text', { filter: (o) => (o.description || '').includes('不正なフォーマット') });

      it('returns an error', async () => {
        return new Promise((resolve, reject) => {
          exec(`env S3_BUCKET=${bucket} S3_OBJECT_PREFIX=${prefix} S3_OBJECT_KEY=${key} ${command}`, (error) => {
            if (!error) {
              reject(new Error('Expected error not occurred'));
              return;
            }

            resolve();
          });
        });
      });
    });
  });
}
