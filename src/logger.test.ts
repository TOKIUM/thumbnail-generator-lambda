import assert from 'power-assert';

import { applyBugsnag } from './logger';

describe('applyBugsnag', () => {
  it('returns a wrapper that resolves with the handler result', async () => {
    const wrapped = applyBugsnag(async () => 42);

    assert.equal(await wrapped({}), 42);
  });

  it('passes the event and context through to the wrapped handler', async () => {
    let receivedEvent: unknown;
    let receivedContext: unknown;

    const wrapped = applyBugsnag(async (event: { foo: string }, context) => {
      receivedEvent = event;
      receivedContext = context;

      return 'ok';
    });

    const event = { foo: 'bar' };
    const context = { functionName: 'fn' } as unknown as AWSLambda.Context;

    const result = await wrapped(event, context);

    assert.equal(result, 'ok');
    assert.deepEqual(receivedEvent, event);
    assert.equal((receivedContext as AWSLambda.Context).functionName, 'fn');
  });

  it('rethrows the error raised by the wrapped handler', async () => {
    const wrapped = applyBugsnag(async () => { throw new Error('boom'); });

    try {
      await wrapped({});

      throw new Error('Expected error not occurred');
    } catch (e) {
      assert.equal((e as Error).message, 'boom');
    }
  });
});
