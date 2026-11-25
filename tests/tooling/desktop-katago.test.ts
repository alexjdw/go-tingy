import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

interface Pipe {
  query(text: string): Promise<string>;
  close(): void;
}
const { KataGoPipe, findEngine, MAX_VISITS } = createRequire(import.meta.url)('../../desktop/katago.js') as {
  KataGoPipe: new (command: string, args: string[]) => Pipe;
  findEngine: (
    dir: string,
    env?: Record<string, string>,
    platform?: string,
  ) => { paths?: Record<string, string>; error?: string; folder?: string; missing?: string[] };
  MAX_VISITS: number;
};

const fake = path.join(import.meta.dirname, 'fake-katago.mjs');
const newPipe = () => new KataGoPipe(process.execPath, [fake]);

test('queries get their own answers, in any order', async () => {
  const pipe = newPipe();
  try {
    const [a, b] = await Promise.all([pipe.query('{"maxVisits":7}'), pipe.query('{"maxVisits":9}')]);
    assert.equal(JSON.parse(a).echoVisits, 7);
    assert.equal(JSON.parse(b).echoVisits, 9);
  } finally {
    pipe.close();
  }
});

test('a page cannot ask for more than the visit limit, and must send a JSON object', async () => {
  const pipe = newPipe();
  try {
    assert.equal(JSON.parse(await pipe.query('{"maxVisits":999999999}')).echoVisits, MAX_VISITS);
    assert.equal(JSON.parse(await pipe.query('{}')).echoVisits, 100);
    await assert.rejects(pipe.query('not json'), /not JSON/);
    await assert.rejects(pipe.query('[1]'), /Not a request/);
  } finally {
    pipe.close();
  }
});

test('when the engine stops, the query fails and the next one starts it again', async () => {
  const pipe = newPipe();
  try {
    await assert.rejects(pipe.query('{"crash":true}'), /stopped/);
    assert.equal(JSON.parse(await pipe.query('{"maxVisits":3}')).echoVisits, 3);
  } finally {
    pipe.close();
  }
});

test('a program that is not there is reported, not thrown', async () => {
  const pipe = new KataGoPipe(path.join(os.tmpdir(), 'no-such-katago-program'), []);
  await assert.rejects(pipe.query('{}'), /Could not start/);
});

test('a katago folder with the program, a network and the config is enough; a missing part is named', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'katago-'));
  try {
    const folder = path.join(dir, 'katago');
    const none = findEngine(dir, {}, 'win32');
    assert.deepEqual(none.missing, ['program', 'network', 'config']);
    assert.equal(none.folder, folder);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'katago.exe'), '');
    fs.writeFileSync(path.join(folder, 'analysis_example.cfg'), '');
    const partial = findEngine(dir, {}, 'win32');
    assert.deepEqual(partial.missing, ['network']);
    assert.match(partial.error ?? '', /missing: network/);
    fs.writeFileSync(path.join(folder, 'kata1-b18c384nbt.bin.gz'), '');
    const ok = findEngine(dir, {}, 'win32');
    assert.equal(ok.paths?.exe, path.join(folder, 'katago.exe'));
    assert.equal(ok.paths?.model, path.join(folder, 'kata1-b18c384nbt.bin.gz'));
    assert.equal(ok.paths?.config, path.join(folder, 'analysis_example.cfg'));
    // a katago.json wins over the folder
    const exe = path.join(dir, 'k.exe');
    fs.writeFileSync(exe, '');
    fs.writeFileSync(path.join(dir, 'katago.json'), JSON.stringify({ exe, model: exe, config: exe }));
    assert.equal(findEngine(dir, {}, 'win32').paths?.exe, exe);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the engine is found from a katago.json or the environment, and a missing one says what to do', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'katago-'));
  try {
    assert.match(findEngine(dir, {}).error ?? '', /not set up/);
    const exe = path.join(dir, 'k.exe');
    fs.writeFileSync(exe, '');
    fs.writeFileSync(path.join(dir, 'katago.json'), JSON.stringify({ exe, model: exe, config: exe }));
    assert.equal(findEngine(dir, {}).paths?.exe, exe);
    fs.writeFileSync(
      path.join(dir, 'katago.json'),
      JSON.stringify({ exe, model: path.join(dir, 'gone'), config: exe }),
    );
    assert.match(findEngine(dir, {}).error ?? '', /model not found/);
    assert.equal(findEngine(dir, { KATAGO_EXE: exe, KATAGO_MODEL: exe, KATAGO_CONFIG: exe }).paths?.model, exe);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
