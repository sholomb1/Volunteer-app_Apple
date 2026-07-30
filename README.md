# Zeh L'Zeh Rescue — Volunteer / Supplier / Coordinator App

React + Vite PWA that ships to Android (via Capacitor → Google Play) **and to iOS via
Xcode** on this repo. One app serves three roles (volunteer, supplier, coordinator) —
the role routing happens inside the React app based on the logged-in user's JWT.

- Web / PWA — deployed to `staging.zehlzeh.org/rescue/` (served from `/var/www/rescue-app`).
- Android — bundled as `org.zehlzeh.volunteer` (see `android/`).
- **iOS — this repo exists specifically so a Mac user (or a cloud macOS build agent)
  can open the Xcode project without needing the Windows dev box.**

---

## Building the iOS app

Requirements on the Mac (or CI runner):

- Node 20+
- CocoaPods (`sudo gem install cocoapods`)
- Xcode 15+

Then:

```bash
git clone https://github.com/sholomb1/Volunteer-app_Apple.git
cd Volunteer-app_Apple

# 1) install JS deps
npm install

# 2) build the web bundle Capacitor will wrap
npx vite build --config vite.cap.config.ts

# 3) copy the web bundle into ios/App/App/public and regenerate
#    capacitor.config.json / config.xml / plugin bridge
npx cap sync ios

# 4) open the Xcode workspace and Archive → Distribute App
open ios/App/App.xcworkspace
```

`cap sync` regenerates the artifacts that `ios/.gitignore` excludes on purpose
(the built web assets under `App/App/public`, `capacitor.config.json`, `config.xml`,
and the Cordova plugin bridge). Everything else lives in the repo.

---

## Building the Android app

On any machine with the Android SDK + JDK 17:

```bash
npm install
npx vite build --config vite.cap.config.ts
npx cap sync android
cd android && ./gradlew assembleRelease
# APK lands at android/app/build/outputs/apk/release/app-release.apk
```

The release build is signed with `android/keystore.properties` — NOT committed.
Get it from the office / project owner before signing.

---

## Repo layout

```
src/               React app source
public/            static assets that ship with the web bundle
capacitor.config.ts  shared Capacitor config (appId, plugins, mixed-content)
android/           Capacitor Android platform (generated once, then hand-tuned)
ios/               Capacitor iOS  platform (generated once, then hand-tuned)
vite.config.ts     web PWA build
vite.cap.config.ts native-wrapper build (skips the service-worker & PWA manifest bits
                   that don't apply inside a Capacitor WebView)
```

Backend API lives in a separate repo (`volunteer-portal`) and runs at
`staging.zehlzeh.org/rescue-api/`.
