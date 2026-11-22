// Generates assets/stone.wav: a muted wooden "thock" (low sine + low-passed noise tick, fast decay).
const fs = require('fs');
const sr = 44100, dur = 0.14, n = Math.floor(sr * dur);
const buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
let lp = 0, seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (let i = 0; i < n; i++) {
  const t = i / sr;
  lp += 0.12 * (rnd() - lp); // heavy low-pass noise = muted click
  const click = lp * Math.exp(-t * 90) * 1.6;
  const body = Math.sin(2 * Math.PI * (170 - 400 * t) * t) * Math.exp(-t * 38) * 0.7;
  const attack = Math.min(1, t / 0.002);
  const v = Math.max(-1, Math.min(1, (click + body) * attack * 0.6));
  buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
}
fs.writeFileSync('assets/stone.wav', buf);
