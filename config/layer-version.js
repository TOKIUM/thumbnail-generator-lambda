const AWS = require('aws-sdk');

function fetchLayerVersion(region, layerName, versionNumber) {
  const lambda = new AWS.Lambda({ apiVersion: '2015-03-31', region });

  if (versionNumber) {
    console.debug(`Fetching the specified version: region=${region}, layer=${layerName}, version=${versionNumber}`);

    return lambda.getLayerVersion({ LayerName: layerName, VersionNumber: versionNumber }).promise();
  }

  console.debug(`Fetching the latest version: region=${region}, layer=${layerName}`);

  return lambda.listLayerVersions({ LayerName: layerName }).promise()
    .then((data) => {
      return (data.LayerVersions && data.LayerVersions[0]) || null;
    });
}

/**
 * @param {string} toolName
 * @param {string} localVersion
 * @param {function} getVersionFromDescription
 * @param {object} layerConfig
 * @param {string} layerConfig.region
 * @param {string} layerConfig.name
 * @param {number} layerConfig.version
 * @returns {AWS.Lambda.LayerVersionsListItem}
 */
module.exports = async function (toolName, localVersion, getVersionFromDescription, layerConfig = {}) {
  const { region, name: layerName, version: layerVersionNum } = layerConfig;

  console.debug(`Cheking ${layerName} version...`);

  const layer = await fetchLayerVersion(region, layerName, layerVersionNum);
  const layerVersion = layer && layer.Version;

  if (!layerVersion) {
    if (layerVersionNum) {
      throw new Error(`${layerName} version ${layerVersionNum} is not found. Please make sure that the version exists.`);
    }

    throw new Error(`${layerName} is not found. Please deploy ${layerName} first.`);
  }

  const layerDescription = layer.Description;

  console.info(`${layerName}: version=${layerVersion}, description=${layerDescription.split('\n').join('\\n')}`);

  const remoteVersion = getVersionFromDescription(layerDescription);

  if (localVersion != remoteVersion) {
    const message = `\x1b[33mATTENTION!: Your local ${toolName} version is ${localVersion} but ${layerName}:${layerVersionNum || 'latest'} uses ${remoteVersion}.\x1b[0m`;

    console.warn(message);
  }

  return layer;
}
