enum ErrorCode {
  CommandError = 'CommandError',
  DimensionUnidentified = 'DimensionUnidentified',
  FailedToGetS3Object = 'FailedToGetS3Object',
  FailedToPutS3Object = 'FailedToPutS3Object',
  InvalidParameter = 'InvalidParameter',
  InternalServerError = 'InternalServerError',
  IOError = 'IOError',
  S3ObjectBodyEmpty = 'S3ObjectBodyEmpty',
}

export default ErrorCode;
