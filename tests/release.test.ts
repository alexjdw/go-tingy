import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAsset, parseRepo } from '../scripts/release';

describe('release script helpers', () => {
  it('finds owner/repo in a GitHub remote', () => {
    assert.equal(parseRepo('https://github.com/alexjdw/go-tingy.git\n'), 'alexjdw/go-tingy');
    assert.equal(parseRepo('git@github.com:alexjdw/go-tingy.git'), 'alexjdw/go-tingy');
    assert.equal(parseRepo('https://example.com/x/y.git'), null);
  });

  it('reads name=source assets', () => {
    assert.deepEqual(parseAsset('a.apk=https://x/y.apk'), { name: 'a.apk', source: 'https://x/y.apk' });
    assert.deepEqual(parseAsset('a.apk=C:\out\a.apk'), { name: 'a.apk', source: 'C:\out\a.apk' });
    assert.equal(parseAsset('noequals'), null);
    assert.equal(parseAsset('dir/a.apk=x'), null);
    assert.equal(parseAsset('a.apk='), null);
  });
});
