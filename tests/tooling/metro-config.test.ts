import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config file
const config = require('../../metro.config.js') as { resolver: { blockList: RegExp | RegExp[] } };
const blocked = (p: string) => [config.resolver.blockList].flat().some((r) => r.test(p));

describe('Metro config', () => {
  it('keeps the native-test scratch projects out of the bundler and its file watcher (Windows and POSIX paths)', () => {
    assert.equal(blocked(String.raw`C:\dev\claude\go_flashcards\.native-test\ios-abc123\app.json`), true);
    assert.equal(blocked(String.raw`C:\dev\claude\go_flashcards\.native-test`), true);
    assert.equal(blocked('/home/me/go_flashcards/.native-test/android-x/android/app/build.gradle'), true);
    assert.equal(blocked('/home/me/go_flashcards/.native-test'), true);
  });

  it('does not block the app itself or look-alike names', () => {
    assert.equal(blocked(String.raw`C:\dev\claude\go_flashcards\src\App.tsx`), false);
    assert.equal(blocked('/home/me/go_flashcards/src/ui/screens/Library.tsx'), false);
    assert.equal(blocked('/home/me/go_flashcards/assets/icon.png'), false);
    assert.equal(blocked('/home/me/go_flashcards/my.native-tests/a.js'), false);
    assert.equal(blocked('/home/me/go_flashcards/.native-tests/a.js'), false);
  });

  it('keeps the Electron shell in desktop/ out, but not other folders called desktop', () => {
    const root = process.cwd();
    assert.equal(blocked(path.join(root, 'desktop', 'node_modules', 'electron', 'index.js')), true);
    assert.equal(blocked(path.join(root, 'desktop')), true);
    assert.equal(blocked(path.join(root, 'desktops', 'a.js')), false);
    assert.equal(blocked(path.join(root, 'node_modules', 'some-package', 'desktop', 'a.js')), false);
  });

  it('keeps Expo\u2019s own exclusions', () => {
    assert.ok([config.resolver.blockList].flat().length >= 2, 'the default blockList entries are still there');
  });
});
