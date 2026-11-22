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

This app does **not** use Expo Router. `src/App.tsx` switches between screens with a small `Screen` state union
(library, study, editor, import, settings); there is no `src/app/` routes folder. Don't add one without discussing it.

## Project layout

```
index.ts                  entry point (registerRootComponent)
src/App.tsx               screen switching, persistence wiring
src/sgf/                  parser, validator, normalizer, editing helpers, encoding, archives, importer (pure TS)
src/go/board.ts           board rules (cols x rows): captures, suicide, simple ko                (pure TS)
src/go/viewport.ts        what part of the board is shown, and where the grid lines go           (pure TS)
src/study/engine.ts       guided / unguided / explore engine, choice modes, color flipping       (pure TS)
src/study/lines.ts        a puzzle's solution lines (root-to-leaf paths) and their length        (pure TS)
src/study/mastery.ts      MasteryRun: all lines in random order, clock, score                    (pure TS)
src/progress/skill.ts     attempt history -> skill level, spaced-repetition due dates            (pure TS)
src/progress/mastery.ts   categories, guided stages, mastery score/levels, daily limit, backups  (pure TS)
src/storage/              AsyncStorage persistence for library, progress, settings, mastery (+15 backups)
src/data/samples.ts       built-in demo problems and the Problem type
src/ui/screens/           Library, Study, Editor, ImportScreen, SettingsScreen
src/ui/components/        Board (SVG), theme + Btn
src/ui/zoom.ts, sound.ts  zoom hook, stone sound
tests/                    node:test suites + tests/fixtures (real SGF collections)
store/                    store listing text, privacy policy/answers, graphics, publishing checklist
scripts/                  asset generation (icons, screenshots) and the store-readiness checks
```

Keep everything under `src/sgf`, `src/go`, `src/study` and `src/progress` free of React and React Native imports so it
stays testable in plain Node.

## Testing

`npm run check` runs the typecheck, ESLint, the Prettier check and the tests (`node:test` via `tsx`, no device needed). `npm run test:native` is another opt-in test: it runs `expo prebuild` into `.native-test/` (git-ignored, excluded from Metro) and checks the generated iOS and Android projects. It cannot compile or run the app (no Xcode here). On Windows the iOS step reports the platform as Linux, because Expo's CLI otherwise refuses to generate the iOS project. After adding a native dependency, run `npm run privacy:sync` and `npm run test:native`. Never put a symlink or junction to `node_modules` in a scratch project: Expo's Android generation hangs on it.
`npm run test:web` is a separate, slower browser test (needs Chrome, builds the web app): it walks every screen at several sizes with a large library and fails on covered, clipped or collapsed buttons. Run it after layout changes; unit tests can't see layout bugs. In React Native Web a bare horizontal `ScrollView` shrinks when a long list is below it, so use `ChipRow` for rows of buttons.
`tests/fixtures/` holds real
puzzle collections; see its README for provenance and licensing. Behavior changes need a test; wrong-answer and
failed-attempt behavior in particular is covered in `tests/solve.test.ts`.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
