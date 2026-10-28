/**
 * stage ごとに使う Lambda レイヤーのバージョン.
 *
 * 全 stage が同じ AWS アカウントにあり、レイヤー名も共通なので、ここで固定しないと、
 * 新しいレイヤーを publish した時点で、次にリリースしたどの stage にも入ってしまう.
 * 対応表にない stage は DEFAULT_LAYER_VERSIONS を使う.
 * 対応表にある stage は、その行の値だけを使い、行に書いていないレイヤーはエラーにする（DEFAULT_LAYER_VERSIONS で補わない）.
 * そのため、レイヤーをこの表に足すとき（image-magick など）は、DEFAULT_LAYER_VERSIONS と各 stage の行の両方に書くこと.
 *
 * ghostscript と poppler は同時に上げること.
 * (Ghostscript 10 系は、pdfinfo が使えないと横向きの PDF を 90 度回転して描画する)
 */
const DEFAULT_LAYER_VERSIONS = {
  ghostscript: 4, // Ghostscript 9.54.0
  poppler: 6, // Poppler 21.06.1
};

// ghostscript 5 = Ghostscript 10.08.0, poppler 7 = Poppler 26.10.0
const STAGE_LAYER_VERSIONS = {
  dev: { ghostscript: 5, poppler: 7 }, // staging
  'dev-tk': { ghostscript: 5, poppler: 7 },
  'dev-ti': { ghostscript: 5, poppler: 7 },
  'dev-td': { ghostscript: 5, poppler: 7 },
  'dev-etc': { ghostscript: 5, poppler: 7 },
  prod: { ghostscript: 5, poppler: 7 },
};

function parseVersion(value, source) {
  const version = Number(value);

  if (!Number.isInteger(version) || version <= 0) {
    throw new Error(`Invalid layer version: ${source}=${value}`);
  }

  return version;
}

/**
 * @param {string} layer - 'ghostscript' | 'poppler'
 * @param {string} stage
 * @param {string} [envName] - 指定されていれば対応表より優先する環境変数の名前（手動で検証するとき用）
 * @returns {number}
 */
module.exports = function resolveLayerVersion(layer, stage, envName) {
  const envValue = envName && process.env[envName];

  if (envValue) {
    const version = parseVersion(envValue, envName);
    console.info(`Using ${layer} layer version ${version} (${envName})`);

    return version;
  }

  const hasStage = Object.hasOwn(STAGE_LAYER_VERSIONS, stage);

  if (!hasStage) {
    console.warn(`Stage ${stage} is not in config/layer-versions.js. Using the default layer versions.`);
  }

  // 既定値で補うと、行の片方だけを上げたときに、無警告で新旧のレイヤーが混ざる
  const versions = hasStage ? STAGE_LAYER_VERSIONS[stage] : DEFAULT_LAYER_VERSIONS;

  if (!Object.hasOwn(versions, layer)) {
    const table = hasStage ? `STAGE_LAYER_VERSIONS['${stage}']` : 'DEFAULT_LAYER_VERSIONS';
    throw new Error(`${layer} layer version is not defined in ${table} of config/layer-versions.js (stage=${stage})`);
  }

  const version = parseVersion(versions[layer], `config/layer-versions.js (${layer}, stage=${stage})`);
  console.info(`Using ${layer} layer version ${version} (stage=${stage}, config/layer-versions.js)`);

  return version;
};
