# Publi

An Expo SDK 57 starter for people who want to turn lived experience, ideas, and opinions into publishable stories.

## Run locally

```sh
npm install
npm run start
```

The Firebase AI Logic and App Check integrations use native modules, so run a development build or a signed release build. Expo Go cannot run these features. `npm run ios` and `npm run android` are also available after native Firebase configuration.

## Current app

- Five bottom tabs: Home, Research, Draft, Coach, and Pitch.
- Firebase Authentication with email/password accounts and anonymous guest accounts.
- A slowly animated branded welcome screen, profile controls, and in-app Terms of Service, Privacy Policy, and About Publi pages.
- A searchable, bookmarkable publication reading list whose links open in the in-app browser, genre cards, and pitch guide links.
- Cloud-synced drafts, profiles, and saved publications in Firestore.
- Private voice note uploads and attempt history in Cloud Storage and Firestore, with playback, transcript, polished text, and three AI follow-up questions.
- A ten-point AI outline for a working title.
- An iPhone-inspired translucent tab dock and layered native shape artwork.

Firebase Authentication, Cloud Firestore, Cloud Storage, AI Logic, and App Check are configured through native Firebase modules. After sign-in, the app offers to import older device data into the current account. Account deletion removes cloud content before deleting the Firebase Authentication account. Publication requirements can change, so the Pitch tab links to the publications' own pages for current guidance.

## Firebase setup required before a native build

1. The iOS Firebase app for `com.publi.app` is registered and its `GoogleService-Info.plist` is in the repository root. For Android support, register `com.publi.app` in Firebase and download `google-services.json` to the root; that file is currently absent.
2. In Firebase App Check, register the native iOS app for App Attest and the Android app for Play Integrity. For local development, register an App Check debug token and set `EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` in the build environment.
3. The Firestore database is the Standard `(default)` edition. The included `firestore.rules` and `storage.rules` passed Firebase CLI dry-run compilation and were deployed to `publi-fa006` on September 29, 2026. Review them before broadly sharing the app.
4. Build an Expo development client or signed release binary. App Attest requires a signed iOS app; the included Expo entitlement is set to production for release builds.

Voice notes are sent to Gemini after recording. Processing time depends on upload and model response latency. Audio over 14 MiB cannot be sent as inline data and currently requires a shorter recording.

The installed Expo SDK 57 JSI dependency needs the included `patch-package` patch on Xcode 26.3. `npm ci` applies it automatically. The unsigned iOS simulator build completed successfully on September 29, 2026, and the app launched to its welcome screen. Signed-device App Attest and end-to-end recording/AI behavior still need verification.

## iOS TestFlight

`codemagic.yaml` defines an iOS App Store build and TestFlight submission workflow. Connect this repository in Codemagic, configure its App Store Connect integration and iOS signing for bundle ID `com.publi.app`, then run the `publi-ios-testflight` workflow. Before public release, replace the draft privacy and terms copy with publisher-approved text and add the publisher's support contact.
