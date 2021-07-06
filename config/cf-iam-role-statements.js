module.exports = () => {
  const buckets = (process.env.S3_BUCKET_LIST || '').split(',').map((x) => x.trim());

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
