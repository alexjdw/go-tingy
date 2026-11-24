import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Analysis, Analyzer, Query } from '../src/analysis/engine';
import { fromResponse, toRequest } from '../src/analysis/katago';

export interface KataGoPaths {
  /** the katago executable */
  exe: string;
  /** a network file (.bin.gz) */
  model: string;
  /** an analysis config (analysis_example.cfg from the KataGo release is a good start) */
  config: string;
}

/** A running `katago analysis` process, answering queries one at a time. Call `close()` when done. */
export class KataGoProcess implements Analyzer {
  private proc: ChildProcessWithoutNullStreams;
  private pending = new Map<string, { ok: (a: Analysis) => void; fail: (e: Error) => void }>();
  private next = 0;
  private log: string[] = [];

  constructor(paths: KataGoPaths) {
    this.proc = spawn(
      paths.exe,
      [
        'analysis',
        '-config',
        paths.config,
        '-model',
        paths.model,
        '-override-config',
        'reportAnalysisWinratesAs=SIDETOMOVE',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    createInterface({ input: this.proc.stdout }).on('line', (line) => this.onLine(line));
    createInterface({ input: this.proc.stderr }).on('line', (line) => this.log.push(line));
    this.proc.on('exit', (code) => {
      const err = new Error(`KataGo exited (${code}). ${this.log.slice(-5).join(' | ')}`);
      for (const p of this.pending.values()) p.fail(err);
      this.pending.clear();
    });
  }

  private onLine(line: string) {
    let raw: { id?: string };
    try {
      raw = JSON.parse(line) as { id?: string };
    } catch {
      return;
    }
    const p = raw.id !== undefined ? this.pending.get(raw.id) : undefined;
    if (!p) return;
    this.pending.delete(raw.id as string);
    try {
      p.ok(fromResponse(raw));
    } catch (e) {
      p.fail(e as Error);
    }
  }

  analyze(query: Query): Promise<Analysis> {
    const id = String(this.next++);
    return new Promise((ok, fail) => {
      this.pending.set(id, { ok, fail });
      this.proc.stdin.write(JSON.stringify(toRequest(id, query)) + '\n');
    });
  }

  close() {
    this.proc.stdin.end();
    this.proc.kill();
  }
}
