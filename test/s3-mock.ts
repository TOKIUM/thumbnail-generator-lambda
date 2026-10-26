import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { AwsStub, mockClient } from 'aws-sdk-client-mock';

let s3Mock = mockClient(S3Client);

type Response = { [key: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

interface S3Object {
  key: string;
  body?: string | Buffer | Uint8Array | Readable;
  contentType?: string;
  contentLength?: number;
}

const etag = '"786212dc8256aedbd739c125a6b08c79"';
const versionId = 'mPkivcujEory9MQhVn6qaWLUVdPU5Gz7';

function buildS3MethodMock(command: any, handler: (input: any) => Promise<any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return s3Mock.on(command).callsFake(handler);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stubGetObject(existingObjects: Array<S3Object>, mock : (AwsStub<any, any, unknown> | null) = null) : AwsStub<any, any, unknown> {
  if (mock) {
    s3Mock = mock;
  }

  buildS3MethodMock(GetObjectCommand, async (input: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const s3Object = existingObjects.find((x) => x.key === input.Key);

    if (s3Object) {
      return Promise.resolve(buildGetObjectResponse(s3Object));
    } else {
      return Promise.reject(buildNoSuchKeyError());
    }
  });

  return s3Mock;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stubPutObject(allowedKeys: Array<string>, mock : (AwsStub<any, any, unknown> | null) = null) : AwsStub<any, any, unknown> {
  if (mock) {
    s3Mock = mock;
  }

  buildS3MethodMock(PutObjectCommand, async (params: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const isAllowed = allowedKeys.find((x) => x === params.Key) ? true : false;

    if (!isAllowed) {
      return Promise.reject(buildAccessDeniedError());
    }

    if (params.Body instanceof Readable) {
      return new Promise((resolve) => {
        params.Body.on('ready', () => {
          resolve(buildPutObjectResponse());
        });
      });
    } else {
      return Promise.resolve(buildPutObjectResponse());
    }
  });

  return s3Mock;
}
