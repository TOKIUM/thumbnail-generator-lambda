import { describe } from 'mocha';
import { exec, execSync } from 'child_process';
import assert from 'power-assert';
import { findS3Object } from '../test/resources';

const bucket = process.env.S3_BUCKET || 'test';
const prefix = process.env.S3_OBJECT_PREFIX || 'prefix';
const stage = process.env.STAGE || 'dev';

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
    const command = `yarn run start:${stage === 'prod' ? 'production' : 'staging'} -f generate-pdf-preview`;

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
    const command = `yarn run start:${stage === 'prod' ? 'production' : 'staging'} -f generate-thumbnails`;

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
  });
}
