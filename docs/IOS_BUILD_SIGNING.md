# Building + signing the iOS app on GitHub Actions

You do not need a Mac. GitHub Actions rents you a macOS runner, our workflow
builds the .ipa there, and you download it (or ship it straight to TestFlight).

This doc walks through the one-time setup — from opening an Apple Developer
account to seeing your first .ipa land as a GitHub artifact.

---

## What you get after setup

Every push to `main` (and every manual "Run workflow" click) will:

1. Compile the app on a macOS runner
2. Sign it with your cert + provisioning profile
3. Produce a real installable `.ipa`
4. (Optional) Auto-upload it to TestFlight so testers can install it

---

## Step 1 — Enroll in the Apple Developer Program ($99/year)

Go to <https://developer.apple.com/programs/enroll/> and enroll as an
individual or organization. Individual is faster (24–48 h); org needs a
DUNS number and takes a week+.

You'll pay $99. You need this to sign any iOS app that runs on a real
device or ships to TestFlight — there is no free path.

---

## Step 2 — Register the App ID in Apple's portal

Go to <https://developer.apple.com/account/resources/identifiers/list>
and click **+** to create a new App ID:

- **Bundle ID (explicit):** `org.zehlzeh.volunteer`
  (this matches `capacitor.config.ts` — don't change it)
- **Description:** Zeh L'Zeh Rescue
- **Capabilities:** enable **Push Notifications** if you'll use them.
  Leave everything else default.

---

## Step 3 — Create a signing certificate + export it as .p12

At <https://developer.apple.com/account/resources/certificates/list>:

1. Click **+** → **Apple Distribution** → Continue.
2. It asks for a Certificate Signing Request (CSR). To make one WITHOUT a
   Mac, use this online generator: <https://help.apple.com/developer-account/#/devbfa00fef7>
   or one of the free CSR web tools. You'll get a `.certSigningRequest` file
   AND a private key `.pem` file — keep both.
3. Upload the CSR, download the resulting `distribution.cer`.
4. Convert the `.cer` + private key into a `.p12` file. Use an online tool
   like <https://decoder.link/converter> — pick "PEM to P12". Set a password
   for the .p12 (any password you'll remember). You'll paste it into a
   GitHub Secret in step 6.
5. Save the `.p12` locally — you'll upload it to GitHub as a Secret.

---

## Step 4 — Create a provisioning profile

At <https://developer.apple.com/account/resources/profiles/list>:

1. Click **+** → **App Store** → Continue.
2. Pick the App ID `org.zehlzeh.volunteer`.
3. Pick the distribution certificate you just created.
4. Name it "Zeh L'Zeh App Store" and download the `.mobileprovision` file.

---

## Step 5 — (Optional but recommended) App Store Connect API key

If you want the workflow to auto-upload to TestFlight instead of just
handing you the .ipa file:

1. Go to <https://appstoreconnect.apple.com/access/api>.
2. Click **+** to create a new API key.
3. Give it the **App Manager** role.
4. Download the `.p8` key file (Apple only shows this download once — save it).
5. Copy the **Key ID** (10-character string next to the key) and the
   **Issuer ID** (the UUID at the top of the same page).

---

## Step 6 — Base64-encode the two binary files

GitHub Secrets can only hold text, so we base64 the `.p12` and
`.mobileprovision` files.

On Windows (PowerShell):
```powershell
# .p12
[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\distribution.p12")) | Set-Clipboard

# .mobileprovision
[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\Zeh_LZeh.mobileprovision")) | Set-Clipboard

# .p8 (App Store Connect API — only if you did step 5)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\AuthKey_XXXXXXXXXX.p8")) | Set-Clipboard
```

Each command copies the base64 string to your clipboard. Paste it into
the matching GitHub Secret in the next step.

---

## Step 7 — Add the Secrets to GitHub

Go to your repo at <https://github.com/sholomb1/Volunteer-app_Apple/settings/secrets/actions>
and click **New repository secret** for each of these:

### Required for signing (Path 1 — .ipa artifact)

| Secret name | What to paste |
|---|---|
| `BUILD_CERTIFICATE_BASE64` | Base64 of your `.p12` file (from step 6) |
| `P12_PASSWORD` | The password you set on the `.p12` in step 3 |
| `BUILD_PROVISION_PROFILE_BASE64` | Base64 of the `.mobileprovision` file |
| `KEYCHAIN_PASSWORD` | Any random string — e.g. `zlz-ci-keychain-2026` |
| `APPLE_TEAM_ID` | Your 10-character Team ID (shown top-right at <https://developer.apple.com/account>) |

### Additional secrets for TestFlight auto-upload (Path 2)

| Secret name | What to paste |
|---|---|
| `APPSTORE_API_KEY_ID` | The 10-char Key ID from step 5 |
| `APPSTORE_API_ISSUER_ID` | The Issuer UUID from step 5 |
| `APPSTORE_API_KEY_BASE64` | Base64 of the `.p8` file |

---

## Step 8 — Trigger the workflow

Go to <https://github.com/sholomb1/Volunteer-app_Apple/actions>, click
**iOS Build**, then **Run workflow** → **Run workflow**.

- If signing secrets are set: it builds, signs, and uploads
  `zlz-rescue-ios.ipa` as a downloadable artifact under the run.
- If the TestFlight secrets are also set: the same .ipa goes straight to
  TestFlight — check <https://appstoreconnect.apple.com/apps> in ~10 min.
- If NO signing secrets: it runs a compile-only check (proves the code
  builds on macOS) but doesn't produce an installable file. This mode is
  useful for verifying the toolchain works before you buy the developer
  account.

Every subsequent `git push` to `main` auto-triggers the same flow.

---

## Distributing to testers via TestFlight

Once the .ipa is in App Store Connect:

1. Open <https://appstoreconnect.apple.com/apps> → your app → **TestFlight**.
2. Add testers by email under **Internal Testing** (up to 100 people from
   your dev team) or **External Testing** (up to 10,000, requires Apple
   review of the build — usually a day).
3. Each tester gets a TestFlight email + can install the app from Apple's
   free TestFlight app.

No developer account, no Mac needed on the tester's side — just the
TestFlight app on their iPhone.

---

## Publishing to the App Store

Once a TestFlight build is stable:

1. In App Store Connect, click **App Store** tab → **+ Version**.
2. Fill in screenshots, description, keywords, category, age rating,
   privacy policy URL.
3. Under **Build**, pick the same build number you tested on TestFlight.
4. Click **Submit for Review**. Apple review takes 24–48 hours typically.

The workflow's IPA is App Store–ready — no extra build needed.

---

## Troubleshooting

- **"No signing certificate found"** — you either forgot a secret,
  base64-encoded the wrong file, or the `.p12` password is wrong. Re-run
  step 6 and re-paste `BUILD_CERTIFICATE_BASE64` + verify `P12_PASSWORD`.
- **"Provisioning profile doesn't match bundle identifier"** — the App ID
  in step 2 must be exactly `org.zehlzeh.volunteer`. If you registered a
  different bundle ID, either change `capacitor.config.ts` to match or
  register a new App ID.
- **"Invalid team ID"** — grab the Team ID from
  <https://developer.apple.com/account/#!/membership/> (10 chars, upper
  case).
- **Build passes but no .ipa artifact** — signing secrets are not all
  present. Check the workflow log — the "Import signing certificate" step
  will be skipped if `BUILD_CERTIFICATE_BASE64` is empty.

Ping the office (or the person who set up this repo) if you get stuck.
