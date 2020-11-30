function normalizeBucket(bucket) {
  if (bucket instanceof Array) {
    return bucket;
  }
  return [bucket];
}

module.exports = (serverless) => {
  const buckets = normalizeBucket(serverless.variables.options.bucket);

  return buckets.map((bucket) => {
    return {
      Effect: 'Allow',
      Action: [
        's3:GetObject',
        's3:PutObject',
      ],
      Resource: {
        'Fn::Join': [
          '',
          [
            `arn:aws:s3:::${bucket}`,
            '/*',
          ],
        ],
      },
    };
  });
};
