const fetchLayerVersion = require('./layer-version');

const GHOSTSCRIPT_LAYER_NAME = 'ghostscript-aws-lambda-layer';

function getLocalGhostscriptVersion() {
  return new Promise((resolve, _reject) => {
    require('child_process').exec('gs --version', (error, stdout, stderr) => {
      if (error) {
        console.error(error);
        resolve(null);
        return;
      }

      if (stderr) {
        console.error(stderr);
      }

      resolve(stdout.split('\n')[0]);
    });
  });
}

function getVersionFromDescription(description) {
  const line = description.split('\n')[0];
  const matched = line.match(/Ghostscript v(\d+(.\d+)+)/);

  return matched ? matched[1] : null;
}

module.exports = async (serverless) => {
  const region = serverless.variables.options.region || 'ap-northeast-1';
  const version = serverless.variables.options.imageMagickLayerVersion;
  const localVersion = await getLocalGhostscriptVersion();
  const layerConfig = { region, name: GHOSTSCRIPT_LAYER_NAME, version };
  const layerVersion = await fetchLayerVersion('Ghostscript', localVersion, getVersionFromDescription, layerConfig);

  return {
    'Fn::Join': [
      ':',
      [
        'arn:aws:lambda',
        { Ref: 'AWS::Region' },
        { Ref: 'AWS::AccountId' },
        'layer',
        GHOSTSCRIPT_LAYER_NAME,
        `${layerVersion.Version}`,
      ],
    ],
  };
};
