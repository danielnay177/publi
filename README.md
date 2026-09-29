# Publi

An Expo SDK 57 starter for people who want to turn lived experience, ideas, and opinions into publishable stories.

## Run locally

```sh
npm install
npm run start
```

Then open the project in Expo Go or a development build. `npm run ios` and `npm run android` are also available.

## Current app

- Five bottom tabs: Home, Research, Draft, Coach, and Pitch.
- Firebase Authentication with email/password accounts and anonymous guest accounts.
- A slowly animated branded welcome screen, profile controls, and in-app Terms of Service, Privacy Policy, and About Publi pages.
- A searchable, bookmarkable publication reading list whose links open in the in-app browser, genre cards, and pitch guide links.
- On-device audio recording, writing notes, local draft save/edit/delete, and three starter follow-up prompts.
- An iPhone-inspired translucent tab dock and layered native shape artwork.

Firebase Authentication is connected to project `publi-fa006`. Drafts, profile details, and saved publications remain on-device; they are not synced to Firebase. Account deletion removes the Firebase Authentication account and clears these local Publi records on the current device. Voice recordings are saved by the device recorder, but are not transcribed or uploaded. Publication requirements can change, so the Pitch tab links to the publications' own pages for current guidance.

## iOS TestFlight

`codemagic.yaml` defines an iOS App Store build and TestFlight submission workflow. Connect this repository in Codemagic, configure its App Store Connect integration and iOS signing for bundle ID `com.publi.app`, then run the `publi-ios-testflight` workflow. Before public release, replace the draft privacy and terms copy with publisher-approved text and add the publisher's support contact.
