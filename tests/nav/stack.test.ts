import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as nav from '../../src/nav/stack';

describe('navigation stack', () => {
  it('pushes screens and goes back', () => {
    let s: nav.Stack<string> = nav.reset('home');
    s = nav.push(s, 'browse');
    s = nav.push(s, 'study');
    assert.equal(nav.current(s), 'study');
    s = nav.pop(s);
    assert.equal(nav.current(s), 'browse');
    s = nav.pop(s);
    assert.equal(nav.current(s), 'home');
    assert.equal(nav.canGoBack(s), false);
  });

  it('never pops the first screen (so Android back can exit the app from home)', () => {
    const s = nav.reset('home');
    assert.deepEqual(nav.pop(s), ['home']);
    assert.deepEqual(nav.popN(nav.push(s, 'a'), 5), ['home']);
  });

  it('replaces and resets', () => {
    assert.deepEqual(nav.replace(['home', 'session'], 'done'), ['home', 'done']);
    assert.deepEqual(nav.popN(['a', 'b', 'c', 'd'], 2), ['a', 'b']);
    assert.deepEqual(nav.reset('x'), ['x']);
  });

  it('does not change the stack it is given', () => {
    const s = ['home', 'browse'] as const;
    nav.push(s, 'x');
    nav.pop(s);
    assert.deepEqual([...s], ['home', 'browse']);
  });
});
