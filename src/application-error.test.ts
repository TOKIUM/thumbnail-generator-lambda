import assert from 'power-assert';

import ApplicationError from './application-error';
import ErrorCode from './error-code';

describe('ApplicationError', () => {
  it('exposes the given code and message', () => {
    const error = new ApplicationError(ErrorCode.IOError, 'something went wrong');

    assert.equal(error.code, 'IOError');
    assert.equal(error.message, 'something went wrong');
  });

  it('is an instance of both Error and ApplicationError', () => {
    const error = new ApplicationError(ErrorCode.InternalServerError, 'boom');

    assert(error instanceof Error);
    assert(error instanceof ApplicationError);
  });

  it('can be caught as ApplicationError when thrown', () => {
    try {
      throw new ApplicationError(ErrorCode.InvalidParameter, 'invalid');
    } catch (e) {
      if (!(e instanceof ApplicationError)) {
        assert.fail('Expected ApplicationError');
      }

      assert.equal(e.code, 'InvalidParameter');
      assert.equal(e.message, 'invalid');
    }
  });
});
