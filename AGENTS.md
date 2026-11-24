This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npm run lint                # ESLint (flat config in eslint.config.js); `npx expo lint` also works
npm run format              # Prettier
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run `npm run check` (typecheck + lint + format check + tests) before declaring any task done.

## Navigation

This app does **not** use Expo Router. `src/App.tsx` keeps a small navigation stack (`src/nav/stack.ts`) of `Screen` values and
shows the last one; Back pops it, and the Android back button does the same (from Home it leaves the app). There is no
`src/app/` routes folder. Don't add one without discussing it.

The app opens on **Home**, where the player picks one of three modes: **Spaced repetition** (a review session that starts at once; Add puzzles and Prune puzzles are on its
end screen), **Guided Learning** (a list of tiles with Add puzzles at the top) or **Browse** (every puzzle as tiles with Play and +; New puzzle, New from game and Import SGF live here).

## Project layout

```
index.ts                  entry point (registerRootComponent)
src/App.tsx               screen switching, persistence wiring
src/sgf/                  parser, validator, normalizer, editing helpers, encoding, archives, importer,
                          fromGame (a game -> a puzzle: moves + crop), folders (collections and their
                          folders: naming an import, browsing, rename) (pure TS)
src/go/board.ts           board rules (cols x rows): captures, suicide, simple ko                (pure TS)
src/go/viewport.ts        what part of the board is shown, and where the grid lines go           (pure TS)
src/go/thumbnail.ts       the 7x7 window a puzzle tile draws                                     (pure TS)
src/go/setup.ts           a puzzle's starting position from its SGF                              (pure TS)
src/study/engine.ts       guided / unguided / explore engine, choice modes, color flipping       (pure TS)
src/study/lines.ts        a puzzle's solution lines (root-to-leaf paths) and their length        (pure TS)
src/study/timed.ts         TimedRun: all lines in random order, clock, score                    (pure TS)
src/study/session.ts      SessionQueue: a spaced-repetition session, missed puzzles retried once (pure TS)
src/nav/stack.ts          the navigation stack                                                   (pure TS)
src/nav/history.ts        browser Back/Forward <-> stack depth (web history entries)             (pure TS)
src/progress/skill.ts     attempt history -> skill level, bar colors, spaced-repetition due dates            (pure TS)
src/progress/learning.ts   categories, guided stages, timed score/levels, daily limit, backups  (pure TS)
src/progress/stats.ts     the stats a tile shows on hover / long press, all modes                (pure TS)
src/progress/practice.ts  what Play does in learning mode; which puzzles look easy (pruning)      (pure TS)
src/storage/              AsyncStorage persistence for library, progress, settings, learning (+15 backups)
src/data/samples.ts       built-in demo problems and the Problem type
src/ui/screens/           Home, Browse, LearningHome, SessionScreen, Picker, Prune, Study, TimedScreen (a learning
                          run), Editor, FromGame (New from game), ImportScreen, SettingsScreen
src/ui/components/        Board (SVG), PuzzleTile/PuzzleGrid/PlusMenu/CollectionBar,
                          LearningBadge (GM, fills with the level), SkillBar (no numbers), ChipRow, ScreenHeader, theme + Btn
src/ui/batch.ts           tile batch rules: 10 at a time (pure TS, tested)
src/ui/zoom.ts, sound.ts  zoom hook, stone sound
tests/                    node:test suites, one folder per area like src/ (sgf, go, study, progress, storage, nav, ui, data),
                          tooling (store, licenses, release, Metro), web (browser) and native; shared helpers.ts;
                          tests/fixtures (real SGF collections)
store/                    store listing text, privacy policy/answers, graphics, publishing checklist
scripts/                  asset generation (icons, screenshots) and the store-readiness checks
```

Keep everything under `src/sgf`, `src/go`, `src/study`, `src/progress` and `src/nav` free of React and React Native imports so it
stays testable in plain Node.

## Progress bar and joseki

The progress bar (`SkillBar`, no numbers, red -> yellow -> green -> gold) is for **guided learning** puzzles only: the first half
fills as clean guided runs step the free moves down, the second half as the best timed score climbs to diamond
(`learningProgress` in `src/progress/learning.ts`). It shows on tiles of puzzles in learning, on the learning screens and after a
guided run. Spaced repetition, joseki mode and normal Browse play never show or change it (spaced sessions still record
attempts for due dates).

Joseki mode is a per-puzzle toggle, remembered in `joseki.v1`, set from Study or the + menu of any tile. It applies in
every mode (Browse, sessions, guided and timed runs, not free exploration): the puzzle is played from the first side,
then from the second (`StudyEngine` option `side: 'second'` plays move 1 for you, with the same colors). A session or
guided run counts both sides as one attempt; a timed run needs every line from both sides.

## Paper mode

Setting `paper` (on / random / off, default off), rolled once when a solving puzzle opens (`Study`; not Hints, Explore or
timed runs). The board is a still diagram (`BoardView paper`, muted palette); in a guided run the given moves are still
clicked through, then the player taps Done and rates it Easy / Medium / Tough / Too tough (`RatingPrompt`, `SelfRating` in
`src/progress/skill.ts`). Spaced sessions record the rating on the `Attempt` (`self` replaces the speed score; too tough =
failed, so the puzzle returns once). A guided run passes it to `recordGuidedResult`: too tough adds one step of free moves
back; the rating of the run that clears the stage at 0 free moves sets `GuidedScore.quality`, which scales the guided half
of the bar. Browse records nothing. A joseki counts the worse of its two sides. Tests: `tests/progress/paper.test.ts`.

## Browser history

On the web each screen is a history entry (`{depth}` state, kept in step in `App.tsx`): in-app Back calls `history.back()`, and the
browser's Back/Forward move along the stack (`toDepth`, screens left behind are kept for Forward until something new
is opened). Android uses the hardware back handler. `tests/web/history.web.ts` covers it.

## Guided runs

In a guided learning run the given (free) moves are not replayed: the player clicks through them, for both colors, on the
green dot (engine phase `follow`, option `follow`; wrong clicks are ignored), then solves the rest alone. The first time,
`RunTutorial` explains this; `seen.v1` remembers which tutorials were shown.

## Color flip

Whether a puzzle is shown with its colors flipped is decided once, when it opens (`chooseFlip` in `src/study/engine.ts`), and then
kept: the engine remembers it across a reset, and the study screen (`Screen.flipped` in `App.tsx`) carries it across
Hints / Solve / Explore (Study is remounted when the mode changes). Explore shows the same colors as solving. A puzzle
opened again gets a new draw. `tests/web/flip.web.ts` covers it.

## Collections

A collection is a named folder of puzzles: `Problem.collection` is its name and `Problem.folder` a path below it
(`Part 1/Peep`). Importing two or more puzzles at once (a folder, a zip with folders, a file of several puzzles) first
asks the player for the collection's name (`suggestName` offers one; "No collection" skips it). The folders of a zip or
a picked folder (web: "Choose folder…") are kept. Browse and the Add puzzles picker show collection chips, then the
folders inside the chosen one; Browse can rename and delete a collection. The logic is in `src/sgf/folders.ts`, tested
in `tests/sgf/folders.test.ts` and `tests/web/collections.web.ts`.

## Desktop

`desktop/` is an Electron shell (its own `package.json` and node_modules) around `expo export --platform web`;
`npm run desktop:prepare` fills `desktop/web`. Metro, ESLint and tsc ignore it. `.github/workflows/release.yml` builds the
Windows and Mac installers, an Android APK and an iOS simulator app when a version tag is pushed, at most one run per 24 hours
(a `gate` job skips the rest; "force" on a manual run overrides it). Store builds (.aab, .ipa) stay on EAS.

## Copyrighted and scraped puzzles

Never put copyrighted or scraped puzzles (anything downloaded from a website or taken from a book or app without a licence
that allows redistribution, such as the `scraped/` folder) in the repo, and never include them in any build: not the
phone apps, the web export, the desktop installers, the store graphics or screenshots, nor test fixtures or built-in samples.
`scraped/` is git-ignored and for personal use only; keep it that way, and keep it out of Metro, `tsc`, ESLint, the Electron
bundle and EAS uploads. Only puzzles we wrote, or whose licence allows it (see `tests/fixtures/README.md`), may ship. If
unsure whether a puzzle may be redistributed, leave it out and ask.

## Responsiveness

The app must feel super responsive. Scrolling, taps and screen changes must never stall or visibly lag, whatever the size
of the library. Do expensive work (drawing boards, parsing SGF, big lists) only for what is on screen, cache or defer
the rest, and show a cheap placeholder instead of making the player wait. Check layout/scroll changes with `npm run test:web`.

## Testing

`npm run check` runs the typecheck, ESLint, the Prettier check and the tests (`node:test` via `tsx`, no device needed). `npm run test:native` is another opt-in test: it runs `expo prebuild` into `.native-test/` (git-ignored, excluded from Metro) and checks the generated iOS and Android projects. It cannot compile or run the app (no Xcode here). On Windows the iOS step reports the platform as Linux, because Expo's CLI otherwise refuses to generate the iOS project. After adding a native dependency, run `npm run privacy:sync` and `npm run test:native`. Never put a symlink or junction to `node_modules` in a scratch project: Expo's Android generation hangs on it.
`npm run test:web` is a separate, slower browser test (needs Chrome, builds the web app): it walks every screen at several sizes with a large library and fails on covered, clipped or collapsed buttons. Run it after layout changes; unit tests can't see layout bugs. It also runs `tests/web/journeys.web.ts` (the Home, Browse, Learning and spaced-repetition session flows, end to end) and `tests/web/batching.web.ts` (tiles load 10 at a time) `tests/web/from-game.web.ts` (New from game, end to end) and `tests/web/joseki.web.ts` (joseki mode) and `tests/web/stats.web.ts` (tile stats) and `tests/web/follow.web.ts` (guided runs and their tutorial) and `tests/web/collections.web.ts` (collections, folders, naming an import). Change a flow or a button label and these tell you what broke.

Puzzle tiles (`PuzzleGrid`) are drawn in batches of `BATCH_SIZE` (10): more load on scroll or from a "Show N more" button. A screen whose list changes (a filter) must give the grid a new `key` so it restarts at the first batch. FlatList unmounts tiles far off screen, so tests must not expect every loaded tile to be in the DOM. In React Native Web a bare horizontal `ScrollView` shrinks when a long list is below it, so use `ChipRow` for rows of buttons.
`tests/fixtures/` holds real
puzzle collections; see its README for provenance and licensing. Behavior changes need a test; wrong-answer and
failed-attempt behavior in particular is covered in `tests/study/solve.test.ts`.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
