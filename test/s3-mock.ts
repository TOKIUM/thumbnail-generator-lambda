import * as AWS from 'aws-sdk';
import { Readable } from 'stream';

import * as AWSMock from 'aws-sdk-mock';
import sinon, { spy } from 'sinon';

type Response = { [key: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

interface S3Object {
  key: string;
  body?: string | Buffer | Uint8Array | Readable;
  contentType?: string;
  contentLength?: number;
}

const etag = '"786212dc8256aedbd739c125a6b08c79"';
const versionId = 'mPkivcujEory9MQhVn6qaWLUVdPU5Gz7';

function buildS3MethodMock<T>(method: string, f: (params: T, callback: Function) => void): sinon.SinonSpy<[T, Function]> {
  const stub = spy(f);

  AWSMock.mock('S3', method, stub);

  return stub;
}

function buildGetObjectResponse(s3Object: S3Object): Response {
  return {
    AcceptRanges: 'bytes',
    LastModified: new Date().toISOString(),
    ContentLength: s3Object.contentLength || 0,
    ETag: etag,
    VersionId: versionId,
    ContentType: s3Object.contentType,
    Metadata: {},
    Body: s3Object.body,
  };
}

function buildPutObjectResponse(): Response {
  return { ETag: etag, VersionId: versionId };
}

function buildS3Error(code: string, statusCode: number, message?: string): Response {
  const response: Response = {
    code,
    region: null,
    time: new Date().toISOString(),
    requestId: '77E6A2FE6A9B9566',
    extendedRequestId: 'sRo9vSBAkX/JxNiqlze/GuGCEHN+CoJk93Of0v57meXFqeZAIWpz5y8GfARH3D4ABr6Lk2H/teE=',
    statusCode,
    retryable: false,
    retryDelay: 76.87850404520566,
  };

  if (message) {
    response.message = message;
  }

  return response;
}

function buildAccessDeniedError(): Response {
  return buildS3Error('AccessDenied', 403);
}

function buildNoSuchKeyError(): Response {
  return buildS3Error('NoSuchKey', 404, 'The specified key does not exist.');
}

export function stubGetObject(existingObjects: Array<S3Object>): sinon.SinonSpy<[AWS.S3.GetObjectRequest, Function]> {
  return buildS3MethodMock('getObject', (params: AWS.S3.GetObjectRequest, callback: Function) => {
    const s3Object = existingObjects.find((x) => x.key === params.Key);

    if (s3Object) {
      callback(null, buildGetObjectResponse(s3Object));
    } else {
      callback(buildNoSuchKeyError(), null);
    }
  });
}

export function stubPutObject(allowedKeys: Array<string>): sinon.SinonSpy<[AWS.S3.PutObjectRequest, Function]> {
  return buildS3MethodMock('putObject', (params: AWS.S3.PutObjectRequest, callback: Function) => {
    const isAllowed = allowedKeys.find((x) => x === params.Key) ? true : false;

    if (!isAllowed) {
      callback(buildAccessDeniedError(), null);
      return;
    }

    if (params.Body instanceof Readable) {
      // streamの読み込みがエラーになる時に、成功時の処理が呼ばれないように
      params.Body.on('ready', () => {
        callback(null, buildPutObjectResponse());
      });
    } else {
      callback(null, buildPutObjectResponse());
    }
  });
}
