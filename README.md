# Go Flashcards

Flashcard-style training for Go (baduk / weiqi): tsumego and joseki from SGF files, on iOS, Android and web
(Expo / React Native).

## Features

- **Guided**, **unguided** and **free exploration** play of any SGF; unguided results feed a per-puzzle skill level
  (red, yellow, green, silver, gold) based on accuracy and speed, with simple spaced-repetition due dates.
- **Multiple choice** puzzles (lettered `A`/`B`/`C` points) and an optional **mark-the-choices** step that replays to a
  branching point and asks you to mark every good move first.
- **Automatic color flipping**, one-shot click-to-zoom for large boards, stone animation and sound.
- **SGF import** from files (`.sgf`, `.sgf.gz`, `.zip`) or pasted text, including whole collections; every puzzle is
  validated, encodings (UTF-8, GBK, Shift_JIS, ...) are detected, and old FF[3] files are normalized.
- An **SGF editor** for building puzzles: board size, setup stones, a move tree with correct / incorrect / neutral
  nodes, and `A`/`B`/`C` labels.

## Run

```bash
npm install
npm run web          # browser
npx expo start       # scan the QR code with Expo Go (iOS / Android)
```

## Develop

```bash
npm run check        # typecheck + lint + format check + tests (run this before committing)
npm run lint         # ESLint            (npm run lint:fix applies safe fixes)
npm run format       # Prettier          (npm run format:check just reports)
npm test             # tests only (node:test, no device needed)
```

Linting is ESLint's recommended rules + typescript-eslint's recommended rules + `eslint-config-expo` (React, hooks,
imports), with a few type-aware checks (floating/misused promises). Prettier owns formatting; the two don't overlap.
Config: `eslint.config.js`, `.prettierrc.json`.

See `AGENTS.md` for the project layout and conventions.

## SGF conventions

Standard SGF, plus a few markers that say which moves are right or wrong:

| Marker | Meaning |
|--------|---------|
| `TE[1]`, or a comment starting `Correct` / `Right` | correct branch |
| `BM[1]`, `DO[1]`, or a comment starting `Wrong` / `Incorrect` | wrong branch |
| `LB[xx:A]` on a position | lettered multiple-choice point |
| `PL[B]` / `PL[W]` | who plays first (else the color of the first move) |
| `C[...]` | explanation shown to the learner |

A leaf not marked wrong counts as a success. On import, a triangle on a move's own point (`;B[br]TR[br]`) is treated
as a wrong branch, which is how the u-go.net uliGo problem files mark refutations.
