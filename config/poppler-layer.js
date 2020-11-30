const fetchLayerVersion = require('./layer-version');

const POPPLER_LAYER_NAME = 'poppler-aws-lambda-layer';

function getLocalPopplerVersion() {
  return new Promise((resolve, _reject) => {
    require('child_process').exec('pdfinfo -v', (error, stdout, stderr) => {
      if (error) {
        console.error(error);
        resolve(null);
        return;
      }

      if (stderr) {
        // なぜかstderrに出力される模様
        const matched = stderr.split('\n')[0].match(/pdfinfo version (\d+(\.\d+)*)/);
        resolve(matched && matched[1]);
        return;
      }

      resolve(null);
    });
  });
}

function getVersionFromDescription(description) {
  const line = description.split('\n')[0];
  const matched = line.match(/Poppler v(\d+(\.\d+)*)/);

  return matched ? matched[1] : null;
}

module.exports = async (serverless) => {
  const region = serverless.variables.options.region || 'ap-northeast-1';
  const version = serverless.variables.options.imageMagickLayerVersion;
  const localVersion = await getLocalPopplerVersion();
  const layerConfig = { region, name: POPPLER_LAYER_NAME, version };
  const layerVersion = await fetchLayerVersion('Ghostscript', localVersion, getVersionFromDescription, layerConfig);

  return {
    'Fn::Join': [
      ':',
      [
        'arn:aws:lambda',
        { Ref: 'AWS::Region' },
        { Ref: 'AWS::AccountId' },
        'layer',
        POPPLER_LAYER_NAME,
        `${layerVersion.Version}`,
      ],
    ],
  };
};
