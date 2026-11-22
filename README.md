# Go Flashcards

Flashcard-style training for Go (baduk / weiqi): tsumego and joseki from SGF files, on iOS, Android and web
(Expo / React Native).

## Features

- **Guided**, **unguided** and **free exploration** play of any SGF; unguided results feed a per-puzzle skill level
  (red, yellow, green, silver, gold) based on accuracy and speed, with simple spaced-repetition due dates.
- **Multiple choice** puzzles (lettered `A`/`B`/`C` points) and an optional **mark-the-choices** step that replays to a
  branching point and asks you to mark every good move first.
- **Two study categories** per puzzle: **spaced repetition** (the only puzzles that ever come due) and **guided
  mastery**.
- **Guided mastery:** a _guided run_ plays some moves for you along a correct line and you solve the rest. Each clean
  run gives fewer free moves, down to zero. Clearing that unlocks the _mastery run_: solve every line of the puzzle in
  random order; your score is correct moves per minute, halved for each mistake (green above 5, gold above 10, diamond
  above 15). Each puzzle allows two guided/mastery attempts a day. Scores are backed up when you leave a run (the 15
  most recent backups are kept) and restored at startup if the saved state is lost.
- **Automatic color flipping**, one-shot click-to-zoom for large boards, stone animation and sound.
- **SGF import** from files (`.sgf`, `.sgf.gz`, `.zip`) or pasted text, including whole collections; every puzzle is
  validated, encodings (UTF-8, GBK, Shift_JIS, ...) are detected, and old FF[3] files are normalized.
- An **SGF editor** for building puzzles: board size (square or rectangular, with any border removed), setup stones, a move tree with correct / incorrect / neutral
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
npm run test:web     # builds the web app and checks every screen for covered/clipped buttons in headless Chrome
npm run test:native  # generates the real iOS and Android projects (no compiling) and checks Info.plist, privacy manifest, permissions, icons
npm run privacy:sync # copy the native packages' privacy-manifest reasons into app.json (run after adding a native dependency)
npm run check:store  # is the repo ready for the App Store / Google Play? (see store/CHECKLIST.md)
npm run assets:icons         # regenerate the icons and store graphics
npm run assets:screenshots   # draft store screenshots from the web build
```

Linting is ESLint's recommended rules + typescript-eslint's recommended rules + `eslint-config-expo` (React, hooks,
imports), with a few type-aware checks (floating/misused promises). Prettier owns formatting; the two don't overlap.
Config: `eslint.config.js`, `.prettierrc.json`.

See `AGENTS.md` for the project layout and conventions.

## SGF conventions

Standard SGF, plus a few markers that say which moves are right or wrong:

| Marker                                                        | Meaning                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TE[1]`, or a comment starting `Correct` / `Right`            | correct branch                                                                                                                                                                                                                              |
| `BM[1]`, `DO[1]`, or a comment starting `Wrong` / `Incorrect` | wrong branch                                                                                                                                                                                                                                |
| `LB[xx:A]` on a position                                      | lettered multiple-choice point                                                                                                                                                                                                              |
| `PL[B]` / `PL[W]`                                             | who plays first (else the color of the first move)                                                                                                                                                                                          |
| `SZ[19]` or `SZ[9:5]`                                         | board size: square, or `columns:rows` for a rectangle (2–25 each)                                                                                                                                                                           |
| `OE[tl]`                                                      | open edges (any of `t` `r` `b` `l`): that side is drawn without a border, as a diagram cropped from a bigger board. Display only: the rules still treat the last row/column as the edge. Private to this app; other SGF software ignores it |
| `C[...]`                                                      | explanation shown to the learner                                                                                                                                                                                                            |

A leaf not marked wrong counts as a success. On import, a triangle on a move's own point (`;B[br]TR[br]`) is treated
as a wrong branch, which is how the u-go.net uliGo problem files mark refutations.
