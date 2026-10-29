# Rotisserie mobile

The Expo app. Day to day it runs in Expo Go against a local API:

```bash
cp .env.example .env.local      # then set EXPO_PUBLIC_API_URL to the laptop's LAN IP
npm start -w @rotisserie/mobile  # scan the QR code with Expo Go
```

Everything below is about putting a real build on a phone. Builds happen on
EAS (Expo Application Services) in the cloud, so no Xcode or Android Studio
project is needed. Both platforms are configured in `app.json` and the build
profiles live in `eas.json`.

## One-time setup

1. Create a free account at expo.dev, then from `apps/mobile`:

   ```bash
   npm install --global eas-cli
   eas login
   eas init                 # creates the EAS project; writes extra.eas.projectId and owner into app.json
   eas update:configure     # writes updates.url into app.json; the channels are already in eas.json
   ```

   Commit the `app.json` changes.

2. iOS needs the Apple Developer Program ($99 a year). Enroll at
   developer.apple.com with your Apple ID; approval takes up to two days.
   TestFlight, ad hoc installs and the App Store all require it. Without it
   an iOS build can only run on your own phone cabled to a Mac, for a week.

3. Android needs nothing to install a build directly. The Google Play
   Console ($25 once) is only for the Play Store and its internal testing
   track.

Signing credentials (the iOS certificate and provisioning profile, the
Android keystore) are generated on the first build and stored on EAS, never
in this repository.

## Build profiles

| Profile      | What it makes                                                                                                      | API                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `preview`    | Installable without a store: an `.apk` for Android, an ad hoc `.ipa` for registered iPhones. Channel `preview`.    | `https://api.rotisserieapp.com` |
| `production` | Store builds (`.aab` and an App Store `.ipa`) with the build number auto-incremented on EAS. Channel `production`. | `https://api.rotisserieapp.com` |

```bash
eas build --profile preview --platform android    # share the install link from the build page
eas build --profile preview --platform ios        # registers the iPhone first: eas device:create
eas build --profile production --platform all
```

## TestFlight (friends and family on iOS)

1. `eas build --profile production --platform ios`. The first run signs in
   to your Apple account and creates the app's identifier and credentials.
2. `eas submit --platform ios --latest`. The first run creates the app
   record in App Store Connect and uploads the build.
3. In App Store Connect, TestFlight tab: add testers. Internal testers (up
   to 100 people with an App Store Connect role) need no review. External
   testers (up to 10,000, by email or public link) need a one-time review of
   the first build.
4. Testers install the TestFlight app and open the invite. A build expires
   after 90 days, so repeat steps 1 and 2 every couple of months.

## Updates without a rebuild

JavaScript-only changes (anything under `src/`, `packages/shared`) reach
installed apps over the air:

```bash
eas update --channel production --environment production --message "what changed"
```

The app downloads it in the background and applies it on the next launch.
`runtimeVersion` follows `version` in `app.json`, so an update only reaches
builds of the same version. A native change (new native module, SDK upgrade,
anything in `app.json` outside `extra` and `updates`) needs a bump of
`version` and new builds; updates published afterwards go only to those.

## Assets

`icon.png`, `adaptive-icon.png`, `adaptive-icon-monochrome.png` and
`splash-icon.png` are generated from `docs/logo.png`: the iOS icon is the
logo with the frame carried to the edges (iOS rounds the corners itself),
the Android foreground is the chicken centered on the cream background with
a white silhouette for themed icons, and the splash is the chicken with a
transparent background so it sits on either the light or dark color.
