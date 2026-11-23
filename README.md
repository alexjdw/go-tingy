# Go Flashcards

Flashcard-style training for Go (baduk / weiqi): tsumego and joseki from SGF files, on iOS, Android and web
(Expo / React Native).

## Features

- **Pick how to study** on the home screen: **Spaced repetition**, **Guided Learning** or **Browse**.
  - **Browse** shows every puzzle as a tile (a 7x7 window of its starting position) with **Play** and **+** under it.
    Play opens the puzzle, where you can switch between hints, solving it yourself and free exploration; **+** adds it
    to spaced repetition and/or guided learning. Creating and importing puzzles are here too.
  - **Spaced repetition** starts a review session at once: the puzzles that are due, one after another, a missed one
    coming back once at the end. The end screen offers **Add puzzles** and **Prune puzzles** (remove the ones that got
    too easy).
  - **Guided Learning** lists your guided-learning puzzles as tiles, with **Add puzzles** at the top. Play does each puzzle's next
    training step (see below).
- **Spaced repetition** records how each review went (accuracy and speed) to decide when a puzzle comes due again.
  Playing a puzzle from Browse never changes that.
- **Multiple choice** puzzles (lettered `A`/`B`/`C` points) and an optional **mark-the-choices** step that replays to a
  branching point and asks you to mark every good move first.
- **Two study categories** per puzzle: **spaced repetition** (the only puzzles that ever come due) and **guided
  learning**.
- **Guided learning:** a _guided run_ gives you some moves along a correct line (you click through them, for both sides, on the green dot; a short tutorial explains it the first time) and you solve the rest. Each clean
  run gives fewer free moves, down to zero. Clearing that unlocks the _mastery run_: solve every line of the puzzle in
  random order; your score is correct moves per minute, halved for each mistake (green above 5, gold above 10, diamond
  above 15). A **GM** badge on the tile fills with the level, and a progress bar shows how far along the puzzle is.
  Each puzzle allows two guided/mastery attempts a day. Scores are backed up when you leave a run (the 15
  most recent backups are kept) and restored at startup if the saved state is lost.
- **Joseki mode** (per puzzle, set from Study or the **+** menu): the puzzle is played from the first side and then
  again from the second, with the first move played for you. It works in every mode.
- **Tile stats:** hover over a tile, or long-press it, to see its stats for spaced repetition, guided learning and joseki.
- **New from game:** load a real game's SGF, scrub to pick the first and last move, then cut the board down to the
  part you want, and save it as a puzzle.
- **Automatic color flipping**, one-shot click-to-zoom for large boards, stone animation and sound.
- **SGF import** from files (`.sgf`, `.sgf.gz`, `.zip`) or pasted text, including whole collections; every puzzle is
  validated, encodings (UTF-8, GBK, Shift_JIS, ...) are detected, and old FF[3] files are normalized.
- An **SGF editor** for building puzzles: board size (square or rectangular, with any border removed), setup stones, a move tree with correct / incorrect / neutral
  nodes, and `A`/`B`/`C` labels.

## Run

You need [Node.js](https://nodejs.org) 20 or newer (the LTS version is fine); npm comes with it.

**Quickest:** run the start script. It installs the dependencies (the first time, or when they change) and opens the
app in your browser.

```bash
start.cmd            # Windows: double-click it, or run it from a terminal
./start.sh           # macOS / Linux
```

Or do it yourself:

```bash
npm install
npm run web          # opens the app in your browser (the quickest way to try it)
npm start            # starts the Expo dev server: press w for web, or scan the QR code with Expo Go
npm run android      # Android emulator or device (needs Android Studio / a connected device)
npm run ios          # iOS simulator (macOS with Xcode only)
```

Your puzzles and progress are saved on the device (in the browser's local storage on the web). To try it with real
puzzles, open **Browse** and use **+ SGF** to import a file, or **New puzzle** / **New from game** to make your own.

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

## License

Go Flashcards is **not open source**. It is free for personal, non-commercial use under the
[Go Flashcards Personal Use License](LICENSE): you may use it and modify it for yourself, but not use it
commercially or redistribute it or anything derived from it. Third-party components keep their own licenses,
listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (regenerate with `npm run licenses`, which also fails
if a package that ships in the app has a license that is not clearly fine for a closed-source app). The puzzle
collections in `tests/fixtures/` are third-party and are not covered by this license.
