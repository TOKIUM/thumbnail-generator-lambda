module.exports = () => {
  const buckets = (process.env.S3_BUCKET_LIST || '').split(',').map((x) => x.trim());

  const s3Statements = buckets.map((bucket) => {
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

  return [
    ...s3Statements,
    {
      // Lambda Destinations(onFailure)でDLQへ送信するための権限
      Effect: 'Allow',
      Action: [
        'sqs:SendMessage',
      ],
      Resource: [
        { 'Fn::GetAtt': ['GeneratePdfPreviewDLQ', 'Arn'] },
        { 'Fn::GetAtt': ['GenerateReceiptThumbnailsDLQ', 'Arn'] },
      ],
    },
  ];
};
