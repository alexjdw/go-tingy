# Answers for the stores' privacy and content forms

These are the answers that match what the app actually does today. If the app gains network features, accounts,
analytics, ads or new permissions, every answer here must be revisited **before** the next submission. Each store
compares your answers with what it can see in the binary.

Facts these answers rest on (verified in the repo):

- No network calls of any kind besides what the OS does for the app. The only `fetch` reads a local file the user
  picked. No analytics or ad SDKs. (`package.json` has none.)
- Android permissions in the generated manifest: `INTERNET` and `MODIFY_AUDIO_SETTINGS` only. Microphone,
  storage, overlay and vibration are blocked or disabled. (See `app.json` and `npm run check:store`.)
- iOS: no usage-description strings (no microphone, camera, photos, location, tracking). No background modes.
  `ITSAppUsesNonExemptEncryption` is `false`. The app's privacy manifest declares no tracking, no collected data,
  and the "required reason" API uses of its native packages. All checked against a generated iOS project by
  `npm run test:native`.
- All data (puzzles, progress, settings, backups) lives in local storage on the device.

## Apple: App Privacy ("nutrition label")

- **Do you or your third-party partners collect data from this app?** No.
- Result shown on the listing: **Data Not Collected**.
- **Tracking:** No. (No `NSPrivacyTracking`, no tracking domains.)
- **Privacy policy URL:** required for every app. Use the hosted `privacy-policy.md`.

## Apple: other App Store Connect questions

- **Export compliance (encryption):** already answered by `ios.config.usesNonExemptEncryption: false`. The app uses
  no encryption of its own beyond what iOS provides.
- **Content rights:** the app does not show third-party content. Puzzles are the user's own files. (The starter
  puzzles are original.)
- **Advertising identifier (IDFA):** No.
- **Age rating:** every category **None** (see `store.config.json` > `advisory`). Expected result: **4+**.
- **Sign-in required for review:** No.

## Google Play: Data safety

- **Does your app collect or share any of the required user data types?** No.
- **Is all of the user data collected by your app encrypted in transit?** Not applicable (no data is collected or
  transmitted).
- **Do you provide a way for users to request that their data is deleted?** Not applicable (no data is collected);
  uninstalling removes everything.
- **Privacy policy URL:** required. Use the hosted `privacy-policy.md`.

## Google Play: App content

- **App access:** all functionality is available without any login or special access.
- **Ads:** the app contains no ads.
- **Content rating (IARC questionnaire):** no violence, sexual content, language, controlled substances,
  gambling, or user-generated content shared between users. Expected: **Everyone / PEGI 3**.
- **Target audience:** general audience; not designed for children. (Choose 13+ or 18+ ranges, not "children", so
  the Families policy requirements do not apply.)
- **News app / government app / health app / financial features:** No.
- **Permissions declarations:** none needed beyond the normal `INTERNET` and `MODIFY_AUDIO_SETTINGS`.
