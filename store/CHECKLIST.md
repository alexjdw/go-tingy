# Publishing checklist

`npm run check:store` verifies everything in the repo that the stores enforce. It must pass before you build.
This list is what is left, in order. Store policies change often: where a step depends on a current rule, it says
**verify**, and you should read the store's current page rather than trust a date written here.

## 0. Already done in the repo

- App icon (opaque 1024px), Android adaptive and themed icons, splash screen, Play icon and feature graphic
  (`npm run assets:icons` regenerates them).
- No microphone, storage, overlay, vibration or background-audio declarations; `expo-asset` installed (a store build
  could crash without it); encryption declaration set; iPad full-screen flag set.
- EAS build profiles with managed build numbers (`eas.json`).
- Listing text for both stores, age-rating and privacy answers, and a privacy policy draft.
- Built-in puzzles are original and checked by the rules; the unverified joseki sample was removed.
- Tests: layout in a real browser (`npm run test:web`), the generated iOS and Android native projects
  (`npm run test:native`), plus the unit tests (`npm run check`).
- Apple privacy manifest: the "required reason" API declarations of the native packages are copied into `app.json`
  (`npm run privacy:sync`) because Apple does not reliably read the manifests inside static pods.

## 1. Decide and fill in (blocks `npm run check:store`)

1. **App ID.** A permanent reverse-domain name you control, e.g. `com.yourname.goflashcards`. Set both
   `expo.ios.bundleIdentifier` and `expo.android.package` in `app.json`. It cannot be changed once the app exists
   in a store.
   - Do not run `npx expo prebuild` and commit the result: it writes a made-up `com.anonymous...` package into
     `app.json`. A test fails if that happens.
2. **Owner details** in `store.config.json`: `copyright` (e.g. `2026 Your Name`), the review contact (name, email,
   phone with country code), and the two URLs below.
3. **Two public web pages**: a **support** page (an email address or contact form is enough) and the **privacy
   policy** (`store/privacy-policy.md`, after you fill in its `TODO`s). A free GitHub Pages site works. Put the
   URLs in `store.config.json` and, later, in the Play Console.
4. **LICENSE.** The file is Expo's template (copyright 650 Industries). Replace it with your own license or
   copyright notice.
5. **Test fixtures.** `tests/fixtures/` holds problem collections from u-go.net whose license is unclear. They are
   not in the app, but do not publish the repository publicly with them included unless you have checked.

## 2. Accounts (you, and they take time)

- **Apple Developer Program**: paid yearly; enrollment can take days. **Verify** current price and requirements.
- **Google Play Console**: one-time fee and identity verification. **Verify** whether new personal accounts must
  run a closed test with a minimum number of testers for a minimum number of days before production access
  (this rule has existed and has changed; read the current Play Console help).
- **Expo account** (free) for EAS.

## 3. Set up EAS

```bash
npm install --global eas-cli      # or use: npx eas-cli <command>
eas login
eas init                          # creates the project and writes extra.eas.projectId into app.json
npm run check:store               # must pass
```

## 4. Test builds on real devices

`npm run test:native` already generates the real iOS and Android projects here and checks their configuration. It
cannot compile or run the app, though: Xcode needs a Mac. Two ways to get further without owning one:

- **Compile on a Mac in the cloud, no Apple account needed:** `eas build --platform ios --profile ios-simulator`
  (needs `eas login` and `eas init`). A successful build proves the native project compiles; the result is a
  simulator build, which only runs in an iOS Simulator on a Mac.
- **Run on a real iPhone:** a production build through TestFlight (needs the Apple Developer account).

The unit tests, the browser test and the native-config test cannot see runtime problems (sound, file picker,
fonts, safe areas). Do this before submitting:

```bash
eas build --platform android --profile preview     # an installable .apk
eas build --platform ios --profile production      # then install via TestFlight
```

Check on a phone **and** a tablet: import a file from the device (`.sgf`, `.sgf.gz`, `.zip`), play each mode,
confirm the stone sound, rotate the device, and let the app sit in the background and come back. iOS internal
distribution needs registered devices; TestFlight is easier. I could not build or run iOS from this Windows
machine, so none of the iOS native configuration has been exercised yet.

## 5. Store listings

**Apple** (App Store Connect):

1. Create the app (EAS can do this on first `eas submit`).
2. `eas metadata:push` uploads the text in `store.config.json` (title, subtitle, description, keywords, category,
   age rating, review notes). **Verify** the field results in App Store Connect.
3. Upload screenshots by hand. Required sizes change: **verify** in App Store Connect. Drafts for the usual
   iPhone 6.9" and iPad 13" sizes are produced by `npm run assets:screenshots`.
4. Answer **App Privacy** with "Data Not Collected" and the other forms using `store/privacy-answers.md`.

**Google Play** (Play Console):

1. Create the app; use the text in `store/play-listing.json` and the graphics in `store/assets/`.
2. Complete **Data safety**, **Content rating**, **Target audience**, **App access** and **Ads** with
   `store/privacy-answers.md`.
3. Upload phone screenshots (and tablet screenshots if you want the tablet listing). Drafts come from
   `npm run assets:screenshots`.

**About the draft screenshots:** they are the real interface rendered in a desktop browser, so fonts and system
chrome differ from a phone, and short screens leave the lower part of the image empty. Treat them as drafts to
check composition. For the listing, take screenshots on a device or emulator (or add captions and device frames),
and make sure they show the app as it really is.

## 6. Build, submit, release

```bash
eas build --platform all --profile production     # build numbers increment automatically
eas submit --platform ios                         # uploads to App Store Connect / TestFlight
eas submit --platform android                     # uploads to the Play Console (needs a service-account key)
```

Then release from each console after review. Increase `expo.version` for each public release.

## 7. Before every later release

- Re-run `npm run check`, `npm run check:store`, and `npm run test:web`.
- If the app gains network features, accounts, analytics, ads or new permissions, update the privacy policy and
  every answer in `store/privacy-answers.md` first.
- Keep the starter puzzles original, or document where their licenses allow redistribution.
