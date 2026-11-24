// A stand-in for `katago analysis`: answers every query line with its id and the visit limit it was given.
import { createInterface } from 'node:readline';

createInterface({ input: process.stdin }).on('line', (line) => {
  const q = JSON.parse(line);
  if (q.crash) process.exit(3);
  console.log(JSON.stringify({ id: q.id, echoVisits: q.maxVisits, moveInfos: [] }));
});
