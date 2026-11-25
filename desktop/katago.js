// A running `katago analysis` process that the app's pages can send queries to (see preload.js and main.js). It only
// moves JSON lines: the page builds the query and reads the answer. Nothing here is specific to Electron, so it
// is tested in plain Node (tests/tooling/desktop-katago.test.js).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createInterface } = require('node:readline');

/** A page cannot ask for unlimited work. */
const MAX_VISITS = 5000;
const TIMEOUT_MS = 120000;

/**
 * Where the engine is, looked for in this order:
 *  1. KATAGO_EXE, KATAGO_MODEL and KATAGO_CONFIG in the environment;
 *  2. a `katago.json` with { "exe": ..., "model": ..., "config": ... } in `dir`;
 *  3. the folder `katago` inside `dir`, holding the program (katago or katago.exe, or on a Mac or Linux one installed
 *     by a package manager), a network (any .bin.gz file) and `analysis_example.cfg` (it comes in KataGo's zip).
 * Returns { paths } when all three are found, or { error, folder, missing } saying what is not, for the setup help.
 */
function findEngine(dir, env = process.env, platform = process.platform) {
  const folder = path.join(dir, 'katago');
  let paths = { exe: env.KATAGO_EXE, model: env.KATAGO_MODEL, config: env.KATAGO_CONFIG };
  const file = path.join(dir, 'katago.json');
  if (!paths.exe && fs.existsSync(file)) {
    try {
      paths = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return { error: `Could not read ${file}: ${e.message}`, folder, missing: [] };
    }
  } else if (!paths.exe) {
    paths = inFolder(folder, platform);
  }
  const missing = [];
  if (!paths.exe) missing.push('program');
  if (!paths.model) missing.push('network');
  if (!paths.config) missing.push('config');
  if (missing.length) {
    return {
      error: `KataGo is not set up yet (missing: ${missing.join(', ')}). It goes in ${folder}.`,
      folder,
      missing,
    };
  }
  for (const key of ['exe', 'model', 'config']) {
    if (!fs.existsSync(paths[key])) return { error: `KataGo ${key} not found: ${paths[key]}`, folder, missing: [] };
  }
  return { paths };
}

/** What a `katago` folder holds: any of the three parts may be missing (undefined). */
function inFolder(folder, platform) {
  const names = fs.existsSync(folder) ? fs.readdirSync(folder).sort() : [];
  const first = (candidates) => candidates.find((n) => names.includes(n));
  const exeName = first(['katago.exe', 'katago']);
  const installed =
    platform === 'win32' ? [] : ['/opt/homebrew/bin/katago', '/usr/local/bin/katago', '/usr/bin/katago'];
  const exe = exeName ? path.join(folder, exeName) : installed.find((f) => fs.existsSync(f));
  const model = names.find((n) => n.endsWith('.bin.gz'));
  const config = first(['analysis_example.cfg', 'analysis.cfg']);
  return {
    exe,
    model: model && path.join(folder, model),
    config: config && path.join(folder, config),
  };
}

const engineArgs = (p) => [
  'analysis',
  '-config',
  p.config,
  '-model',
  p.model,
  '-override-config',
  'reportAnalysisWinratesAs=SIDETOMOVE',
];

class KataGoPipe {
  constructor(command, args) {
    this.command = command;
    this.args = args;
    this.proc = null;
    this.pending = new Map();
    this.next = 0;
    this.log = [];
  }

  start() {
    const proc = spawn(this.command, this.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    createInterface({ input: proc.stdout }).on('line', (line) => this.onLine(line));
    createInterface({ input: proc.stderr }).on('line', (line) => {
      this.log.push(line);
      if (this.log.length > 20) this.log.shift();
    });
    const failAll = (message) => {
      if (this.proc === proc) this.proc = null;
      for (const p of this.pending.values()) p.fail(new Error(message));
      this.pending.clear();
    };
    proc.on('error', (e) => failAll(`Could not start KataGo: ${e.message}`));
    proc.on('exit', (code) => failAll(`KataGo stopped (${code}). ${this.log.slice(-3).join(' | ')}`));
    this.proc = proc;
  }

  onLine(line) {
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      return;
    }
    const p = this.pending.get(raw.id);
    if (!p) return;
    this.pending.delete(raw.id);
    clearTimeout(p.timer);
    p.ok(line);
  }

  /** Send one request (a JSON object as text); resolves with the engine's answer as text. */
  query(text) {
    let req;
    try {
      req = JSON.parse(text);
    } catch {
      return Promise.reject(new Error('The request is not JSON'));
    }
    if (!req || typeof req !== 'object' || Array.isArray(req)) return Promise.reject(new Error('Not a request'));
    const id = `q${this.next++}`;
    req.id = id;
    req.maxVisits = Math.max(1, Math.min(Number(req.maxVisits) || 100, MAX_VISITS));
    if (!this.proc) this.start();
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        fail(new Error('KataGo took too long to answer'));
      }, TIMEOUT_MS);
      this.pending.set(id, { ok, fail: (e) => (clearTimeout(timer), fail(e)), timer });
      this.proc.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  close() {
    if (this.proc) this.proc.kill();
    this.proc = null;
  }
}

module.exports = { KataGoPipe, findEngine, engineArgs, MAX_VISITS };
