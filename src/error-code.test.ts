import assert from 'power-assert';

import ErrorCode from './error-code';

describe('ErrorCode', () => {
  it('maps every member name to an identical string value', () => {
    Object.entries(ErrorCode).forEach(([key, value]) => {
      assert.equal(value, key);
    });
  });

  it('defines the expected error codes', () => {
    assert.equal(ErrorCode.CommandError, 'CommandError');
    assert.equal(ErrorCode.DimensionUnidentified, 'DimensionUnidentified');
    assert.equal(ErrorCode.FailedToGetS3Object, 'FailedToGetS3Object');
    assert.equal(ErrorCode.FailedToPutS3Object, 'FailedToPutS3Object');
    assert.equal(ErrorCode.S3ObjectBodyEmpty, 'S3ObjectBodyEmpty');
  });
});
