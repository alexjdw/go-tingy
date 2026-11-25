import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONFIG, KATAGO_VERSION, NETWORK, setupGuide } from '../../src/analysis/setup';

describe('the setup guide', () => {
  it('Windows: the OpenCL program and the network, with a CPU fallback', () => {
    const g = setupGuide('win32', 'x64');
    assert.equal(g.os, 'Windows');
    assert.equal(g.tested, true);
    assert.ok(g.links.some((l) => l.url.endsWith(`katago-${KATAGO_VERSION}-opencl-windows-x64.zip`)));
    assert.ok(g.links.some((l) => l.url === NETWORK.url));
    assert.match(g.fallback ?? '', /eigenavx2-windows/);
    assert.ok(g.steps.some((s) => /Check again/.test(s)));
  });

  it('macOS: Homebrew, the network and the configuration file, and says it is untried', () => {
    const g = setupGuide('darwin', 'arm64');
    assert.equal(g.os, 'macOS');
    assert.equal(g.tested, false);
    assert.match(g.steps[0], /brew install katago/);
    assert.ok(g.links.some((l) => l.url === CONFIG.url));
    assert.match(g.steps.join(' '), new RegExp(CONFIG.name));
  });

  it('Linux on x64 gets the Linux program; other Linux and other systems are told to build it', () => {
    assert.ok(setupGuide('linux', 'x64').links.some((l) => /opencl-linux-x64/.test(l.url)));
    const arm = setupGuide('linux', 'arm64');
    assert.equal(arm.os, 'Linux (arm64)');
    assert.match(arm.steps[0], /no ready-made program/);
    assert.ok(setupGuide('freebsd', 'x64').links.length > 0);
  });

  it('every link is https and the network is the one the app names', () => {
    for (const p of ['win32', 'darwin', 'linux', 'sunos']) {
      for (const l of setupGuide(p, 'x64').links) assert.match(l.url, /^https:\/\//);
    }
    assert.match(NETWORK.name, /b18c384nbt/);
    assert.ok(NETWORK.url.endsWith(NETWORK.name));
  });
});
