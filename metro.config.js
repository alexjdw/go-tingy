// Metro (the JavaScript bundler and its file watcher) configuration.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `npm run test:native` generates throwaway native projects in .native-test/. They are not part of the app, so
// keep Metro from crawling and watching them (a watched folder can't be deleted promptly on Windows).
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], /(^|[\\/])\.native-test([\\/].*)?$/);

module.exports = config;
