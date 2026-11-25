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
**Add puzzles** (on the Guided Learning screen and the spaced-repetition end screen) opens that same Browse screen with `addTo`
set to the study mode: the title reads "Add puzzles", each tile has an Add button instead of Play (the + menu is still there),
and with a collection chosen one button adds the whole collection or folder. So a new player can also create or import there.

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
src/analysis/             KataGo second opinion: position -> engine query, protocol, review of a puzzle's tree,
                          suggestions for one position, the desktop bridge (pure TS; engine runs behind `Analyzer`)
src/study/engine.ts       guided / unguided / explore engine, choice modes, color flipping       (pure TS)
src/study/lines.ts        a puzzle's solution lines (root-to-leaf paths) and their length        (pure TS)
src/study/treeLayout.ts    the game tree on a grid (rows = lines of play) for the tree picture                    (pure TS)
src/study/timed.ts         TimedRun: all lines in random order, clock, score                    (pure TS)
src/study/session.ts      SessionQueue: a spaced-repetition session, missed puzzles retried once (pure TS)
src/sync/                 cloud sync: snapshot + merge of two devices' data, the sync step, a Google Drive provider  (pure TS)
src/nav/stack.ts          the navigation stack                                                   (pure TS)
src/nav/history.ts        browser Back/Forward <-> stack depth (web history entries)             (pure TS)
src/progress/skill.ts     attempt history -> skill level, bar colors, spaced-repetition due dates            (pure TS)
src/progress/learning.ts   categories, guided stages, timed score/levels, daily limit, backups  (pure TS)
src/progress/stats.ts     the stats a tile shows on hover / long press, all modes                (pure TS)
src/progress/practice.ts  what Play does in learning mode; which puzzles look easy (pruning)      (pure TS)
src/storage/              AsyncStorage persistence for library, progress, settings, learning (+15 backups)
src/data/samples.ts       built-in demo problems and the Problem type
src/ui/screens/           Home, Browse, LearningHome, SessionScreen, Prune, Study, TimedScreen (a learning
                          run), Editor, FromGame (New from game), ImportScreen, SettingsScreen
src/ui/components/        Board (SVG), PuzzleTile/PuzzleGrid/PlusMenu/CollectionBar,
                          LearningBadge (SVG: red, yellow, green dots, gold star, diamond), SkillBar (no numbers), ChipRow, ScreenHeader, theme + Btn
src/ui/batch.ts           tile batch rules: 10 at a time (pure TS, tested)
src/ui/zoom.ts, sound.ts  zoom hook, stone sound
tests/                    node:test suites, one folder per area like src/ (sgf, go, study, progress, storage, nav, ui, data),
                          tooling (store, licenses, release, Metro), web (browser) and native; shared helpers.ts;
                          tests/fixtures (real SGF collections)
store/                    store listing text, privacy policy/answers, graphics, publishing checklist
scripts/                  asset generation (icons, screenshots) and the store-readiness checks
```

Keep everything under `src/sgf`, `src/go`, `src/study`, `src/progress`, `src/sync` and `src/nav` free of React and React Native imports so it
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

## Backlog, auto mode and diamond

Settings has **Work through a backlog**: `backlogCount` (default 5) and `backlogDays` (default 7), plus Choose puzzles, which opens
`BacklogPicker` (screen `backlog`). It lists puzzles in spaced repetition or guided learning, lowest score first
(`backlogCandidates` in `src/progress/backlog.ts`: the average of the guided progress and the spaced score), and Confirm
makes up to `count` of them a _priority_ for `days` days: `LearningState.priority` (id -> end time, optional, synced:
`mergeSnapshots` keeps both devices' entries, the later end winning). Priority puzzles are at the top of the guided list
(`priorityFirst`) and first in a spaced session when due (`pickSessionIds`' `first`). The settings are in the synced `Settings`.

Guided learning has an **Auto** button: pick N, and `pickAutoIds` (`src/study/auto.ts`) takes N puzzles that can be played
today, red first, then yellow, green, gold, random inside a level, never diamond. `App.tsx` keeps the plan in the `auto` state. A run screen shows "Auto 2 of 5 · 3 to go" (`autoStatus`) and, once the run is over, a Next button (`autoNext`: Next attempt, Next puzzle or Finish; `swap`, with a `nonce` so the same puzzle remounts) that stays on a puzzle until its 2 daily attempts are gone. Back (`‹ End auto`) always ends auto mode.

Reaching diamond on a timed run asks (`DiamondPrompt`) whether to move the puzzle to spaced repetition
(`graduateToSpaced`): it leaves guided learning (scores kept), joins spaced repetition, and if it was not there its history gets
ten perfect attempts (gold, due in three weeks). Long press or double tap on a collection or folder chip in Browse opens
`BulkMenu`: add or remove everything inside (folders too) to or from either mode. `ChipRow` wraps and folds to three lines
with View more. Letters (LB) on a puzzle only force a choice when one of them is a correct branch (`choicePoints`); otherwise they just explain. Tests: `tests/progress/backlog.test.ts`, `tests/study/auto.test.ts`, `tests/web/backlog.web.ts`,
`tests/web/chips.web.ts`, `tests/web/collections.web.ts`.

## Paper mode

Setting `paper` (on / random / off, default off), rolled once when a solving puzzle opens (`Study`; not Hints, Explore or
timed runs). The board is a still diagram (`BoardView paper`, muted palette); in a guided run the given moves are still
clicked through, then the player taps Done and rates it Easy / Medium / Tough / Too tough (`RatingPrompt`, `SelfRating` in
`src/progress/skill.ts`). Spaced sessions record the rating on the `Attempt` (`self` replaces the speed score; too tough =
failed, so the puzzle returns once). A guided run passes it to `recordGuidedResult`: too tough adds one step of free moves
back; the rating of the run that clears the stage at 0 free moves sets `GuidedScore.quality`, which scales the guided half
of the bar. Double tapping the diagram turns it over to the numbered main solution line (`solutionDiagram` in
`src/study/diagram.ts`; setup stones unnumbered), and again turns it back; `tests/study/diagram.test.ts`, `tests/web/paper.web.ts`.
Browse records nothing. A joseki counts the worse of its two sides. Tests: `tests/progress/paper.test.ts`.

## Explore mode and the tree

In explore mode `StudyEngine` walks the tree: `back()` (the parent; after leaving the book, the previous position),
`forward()` (`preferredChild` in `src/study/lines.ts`: a branch leading to a correct move, else one not leading only to
failure, else the first) and `jumpTo(node)`. The left/right arrow keys (`useArrowKeys`, web only) and the tree picture
(`TreeView`, tap a move) use them; the Editor's move tree has the same picture and keys. `TreeView` redraws only when
its `layout` changes, so callers memoize the layout (`treeSignature` tells an in-place edited tree apart) and pass a
stable `onSelect`. Tests: `tests/study/explore-walk.test.ts`, `tests/web/tree.web.ts`.

## KataGo setup (desktop)

`findEngine` (`desktop/katago.js`) looks for the engine in the environment, then `katago.json`, then the `katago` folder in
the app's data folder. When it is missing, `status()` says what (`missing`) and where (`setup.folder`), and the Editor shows
`KataGoSetup`: per-OS steps from `setupGuide` in `src/analysis/setup.ts` (pinned KataGo release and network, links checked
to exist), Open the folder, Check again. Update the version and links there when moving to a newer release. The guide is
tried on Windows only. Tests: `tests/analysis/setup.test.ts`, `tests/tooling/desktop-katago.test.ts`, `tests/web/engine.web.ts`.

## Splitting a puzzle (desktop only)

In free exploration the desktop app (the page has `window.katago`, see `getBridge`) offers **Split off here**: the position
at the current move, with everything played after it, becomes a new puzzle (`src/sgf/split.ts`: the stones on the board
become the starting stones, the next mover plays first, a flipped view is written back in the original colors) that
opens in the Editor with the title "<title> (split)" and a fresh id; nothing is saved until the player saves it. In the
Editor, **KataGo helps: on/off** (default on when the engine is set up): a new move gets KataGo's best reply as a one-exchange
branch (`AI_VISITS`, about a second), and Save first runs `reviewPuzzle` and shows its findings (`CheckPanel`) so the author
can keep editing or save anyway; with it off the Editor is hand-built as before. A first-player move that KataGo's reply refutes (`isRefuted` in `src/analysis/suggest.ts`:
gives away 30% of the win chance or 15 points compared with its favorite) is marked wrong (BM) unless it already has a mark, with
an Undo button; the bar is high on purpose, since in a corner problem the whole-game win chance barely moves and a smaller
valid solution must not be marked wrong. The Editor keeps a puzzle's other fields
(collection, folder) when saving. Tests: `tests/sgf/split.test.ts`, `tests/analysis/describe.test.ts`, `tests/web/split.web.ts`.

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
a picked folder (web: "Choose folder…") are kept. Browse (also as Add puzzles) shows collection chips, then the
folders inside the chosen one; Browse can rename and delete a collection. The logic is in `src/sgf/folders.ts`, tested
in `tests/sgf/folders.test.ts` and `tests/web/collections.web.ts`.

## Cloud sync and the web app

iPhone users run the web app (an iOS app needs Apple signing), hosted free on GitHub Pages by `.github/workflows/pages.yml`
(`experiments.baseUrl` is set to the repo's sub-path in CI only). `public/` holds the manifest, the home-screen icons
(`npx tsx scripts/make-web-icons.ts`) and `index.html` with the iOS meta tags; links in it must stay relative.
Settings has **Sync with Google Drive** (web only, hidden unless `EXPO_PUBLIC_GOOGLE_CLIENT_ID` was set at build time): the
player's puzzles, attempts, joseki list, learning state and settings are one JSON file in their own Drive `appDataFolder`
(scope `drive.appdata` only). Sign-in is Google's token client (`src/ui/googleAuth.ts`, no secret, token in memory and the tab's session storage, so a reload does not ask Google again; opening the app never opens Google's window by itself, a tap on the amber cloud on Home does);
`src/ui/useSync.ts` syncs on opening, 15 s after a change, and when the tab regains focus, never while a puzzle is open.
The merge (`src/sync/snapshot.ts`) is pure (a device that never synced keeps the cloud's lists and settings, `first`; `applyAfterSync` in `run.ts` keeps what changed while a sync ran): puzzles by id, deletions as markers (`deleted.v1`), attempts combined once
each, the more practiced learning record wins, and the newer device wins for settings, joseki and which puzzles are in a
learning list. A damaged cloud file is never overwritten unless the player asks. Tests: `tests/sync/sync.test.ts`,
`tests/web/sync.web.ts` (two devices, fake Drive).

## Desktop

`desktop/` is an Electron shell (its own `package.json` and node_modules) around `expo export --platform web`; `preload.js` gives
the page `window.katago` (status/query) and `katago.js` pipes JSON lines to a user-installed `katago analysis` (the Editor's
"Ask KataGo", `src/ui/engine.ts`; tested in `tests/tooling/desktop-katago.test.ts` and `tests/web/engine.web.ts`);
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
