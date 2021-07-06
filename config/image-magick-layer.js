const fetchLayerVersion = require('./layer-version');

const IMAGE_MAGICK_LAYER_NAME = 'image-magick-aws-lambda-layer';

function getLocalImageMagickVersion() {
  return new Promise((resolve, _reject) => {
    require('child_process').exec('identify --version', (error, stdout, stderr) => {
      if (error) {
        console.error(error);
        resolve(null);
        return;
      }

      if (stderr) {
        console.error(stderr);
      }

      const matched = stdout.match(/Version: ImageMagick (\d+(\.\d+)*(-\d+)?)/);
      resolve(matched && matched[1]);
    });
  });
}

function getVersionFromDescription(description) {
  const line = description.split('\n')[0];
  const matched = line.match(/ImageMagick v(\d+(\.\d+)*(-\d+)?)/);

  return matched ? matched[1] : null;
}

module.exports = async ({ resolveVariable }) => {
  const region = await resolveVariable('self:provider.region, "ap-northeast-1"');
  const version = process.env.IMAGE_MAGICK_LAYER_VERSION;
  const localVersion = await getLocalImageMagickVersion();
  const layerConfig = { region, name: IMAGE_MAGICK_LAYER_NAME, version };
  const layerVersion = await fetchLayerVersion('ImageMagick', localVersion, getVersionFromDescription, layerConfig);

  return {
    'Fn::Join': [
      ':',
      [
        'arn:aws:lambda',
        { Ref: 'AWS::Region' },
        { Ref: 'AWS::AccountId' },
        'layer',
        IMAGE_MAGICK_LAYER_NAME,
        `${layerVersion.Version}`,
      ],
    ],
  };
};
