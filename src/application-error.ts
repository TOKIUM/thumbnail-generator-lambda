// TODO: stack traceの処理
export default class ApplicationError extends Error {
  constructor(public code: string, message: string) {
    super(message);

    Object.setPrototypeOf(this, this.constructor.prototype);
  }
}
