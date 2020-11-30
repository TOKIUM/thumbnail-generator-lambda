import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import * as sinon from 'sinon';

type CommandMatcher = string | RegExp | ((command: string) => boolean);

interface CommandStub extends sinon.SinonStub<Parameters<typeof childProcess.exec>, childProcess.ChildProcess>{
  // @types/sinon で未定義なのでパッチ
  wrappedMethod: typeof childProcess.exec;
}

function matchCommand(command: string, matcher: CommandMatcher): boolean {
  if (typeof matcher === 'string') {
    return command === matcher;
  }

  if (typeof matcher === 'function') {
    return matcher(command);
  }

  return matcher.test(command);
}

export function mockCommand(
  command: CommandMatcher, callback: (process: childProcess.ChildProcess) => void, execTime = 0
): sinon.SinonStub<Parameters<typeof childProcess.exec>, childProcess.ChildProcess> {
  const sandbox = sinon.createSandbox();
  const stub = sandbox.stub(childProcess, 'exec') as CommandStub;

  return stub.callsFake((...args) => {
    if (!matchCommand(args[0], command)) {
      return (stub.wrappedMethod)(...args);
    }

    const process = new EventEmitter() as childProcess.ChildProcess;
    process.stdout = new EventEmitter() as Readable;
    process.stderr = new EventEmitter() as Readable;

    setTimeout(() => { callback(process); }, execTime);

    return process;
  });
}
