const path = require('path');
const { execSync } = require('child_process');

const webpack = require('webpack');
const slsw = require('serverless-webpack');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const { BugsnagBuildReporterPlugin, BugsnagSourceMapUploaderPlugin } = require('webpack-bugsnag-plugins');

const bugsnagApiKey = process.env.BUGSNAG_API_KEY;
const stage = slsw.lib.serverless.service.provider.stage;
const packageJson = require('./package.json');
const appVersion = packageJson.version;
const repositoryUrl = packageJson.repository.url;
const revision = execSync('git rev-parse HEAD').toString();

const enableBugsnag = !slsw.lib.webpack.isLocal && !!bugsnagApiKey;

module.exports = {
  context: __dirname,
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
  entry: slsw.lib.entries,
  devtool: slsw.lib.webpack.isLocal ? 'cheap-module-eval-source-map' : 'source-map',
  resolve: {
    extensions: ['.js', '.mjs', '.json', '.ts'],
    symlinks: false,
    cacheWithContext: false,
  },
  output: {
    libraryTarget: 'commonjs',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js',
  },
  target: 'node',
  externals: ['aws-sdk'],
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        exclude: [
          [
            path.resolve(__dirname, 'node_modules'),
            path.resolve(__dirname, '.serverless'),
            path.resolve(__dirname, '.webpack'),
          ],
        ],
        options: {
          transpileOnly: true,
          experimentalWatchApi: true,
        },
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': stage === 'prod' ? JSON.stringify('production') : JSON.stringify('development'),
      'process.env.LOG_LEVEL': stage === 'prod' ? JSON.stringify('verbose') : JSON.stringify('debug'),
      'process.env.THUMBNAIL_DESTINATION_PREFIX': JSON.stringify(process.env.THUMBNAIL_DESTINATION_PREFIX),
      'process.env.BUGSNAG_API_KEY': JSON.stringify(bugsnagApiKey),
      'process.env.APP_VERSION': JSON.stringify(appVersion),
    }),
    new ForkTsCheckerWebpackPlugin({
      eslint: { files: ['src/**/*.ts', 'test/**/*.ts'], options: { cache: true } },
    }),
  ].concat(
    enableBugsnag ? [
      new BugsnagBuildReporterPlugin({
        apiKey: bugsnagApiKey,
        appVersion,
        releaseStage: stage,
        sourceControl: {
          provider: 'github',
          repository: repositoryUrl,
          revision,
        },
      }),
      new BugsnagSourceMapUploaderPlugin({
        apiKey: bugsnagApiKey,
        appVersion,
        releaseStage: stage,
        overwrite: true,
      }),
    ] : []
  ),
};
