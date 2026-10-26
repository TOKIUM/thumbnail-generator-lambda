import assert from 'power-assert';

import CommandService from './command-service';

describe('CommandService', () => {
  describe('.run', () => {
    it('passes the command stdout to the callback and resolves with its result', async () => {
      const result = await CommandService.run('echo hello', (output) => output.trim());

      assert.equal(result, 'hello');
    });

    it('lets the callback transform the output', async () => {
      const length = await CommandService.run('printf foobar', (output) => output.length);

      assert.equal(length, 6);
    });

    it('rejects when the callback throws', async () => {
      try {
        await CommandService.run('echo hi', () => { throw new Error('boom'); });

        throw new Error('Expected error not occurred');
      } catch (e) {
        assert.equal((e as Error).message, 'boom');
      }
    });
  });
});
