# SquadSpell on Android (Google Play)

The game UI is the same web client as the desktop browser version, wrapped with [Capacitor](https://capacitorjs.com/) so it installs as a native Android app.

## What works on the phone

- **Pass & play** — fully offline; no server needed.
- **Create room / Enter room** — the phone is a **client** only. Something on your Wi‑Fi (usually a PC) must run the real game server (`npm start` or `SquadSpell.exe`). On the Android app’s main menu, set **Wi‑Fi room server** to that machine’s URL, e.g. `http://192.168.0.15:3331`, then tap **Save**.

Cleartext HTTP/WebSocket to LAN addresses is allowed so this home-LAN flow works. For a future “no PC” experience you would need a hosted backend with **HTTPS/WSS** and app changes to point at it.

## One-time setup

1. Install [Android Studio](https://developer.android.com/studio) (includes Android SDK).
2. In this repo: `npm install`

## After you change `index.html` or game assets

```bash
npm run android:sync
```

This copies static files into `www/` and refreshes `android/app/src/main/assets/public`.

## Open in Android Studio

```bash
npm run android:open
```

Or open the `android` folder in Android Studio.

## Release build for Play Console

1. In Android Studio: **Build → Generate Signed App Bundle / APK** (or use Gradle `bundleRelease`).
2. Create or use an upload key; Google Play manages the app signing key.
3. Upload the **.aab** (Android App Bundle) in [Play Console](https://play.google.com/console).

## Play Store checklist (short)

- **Privacy policy URL** — required if you collect data; for this client-only + optional LAN server setup, still publish a simple policy (what the app does, no accounts, optional local server URL stored on device).
- **Data safety form** — declare network access, local storage (theme, optional server URL, saved games).
- **Store listing** — screenshots, feature graphic, description; replace default launcher icons under `android/app/src/main/res/mipmap-*` with branded art.
- **Content rating** — questionnaire (board game / no realistic violence).

## App ID

`com.squadspell.app` is set in `capacitor.config.json`. Change it before shipping if you use a different package name (must match Play Console).
