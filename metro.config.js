// Metro (the JavaScript bundler and its file watcher) configuration.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `npm run test:native` generates throwaway native projects in .native-test/. They are not part of the app, so
// keep Metro from crawling and watching them (a watched folder can't be deleted promptly on Windows).
// desktop/ is the Electron shell (its own node_modules and web export), also not part of the app bundle; it is
// matched by its full path so that a folder named desktop inside some package is left alone.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [].concat(
  config.resolver.blockList ?? [],
  /(^|[\\/])\.native-test([\\/].*)?$/,
  new RegExp('^' + escapeRegExp(path.join(__dirname, 'desktop')) + '([\\\\/].*)?$'),
);

module.exports = config;
