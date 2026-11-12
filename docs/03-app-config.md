[← README](../README.md) · Prev: [Usage](02-usage.md) · Next: [Self-signed SSL](04-self-signed-ssl.md)

# App configuration, icon and splash

## Per-app configuration (`apps/<name>/app.config.json`)

Only `appId`, `appName`, `server.url` are mandatory. Everything else falls back to `platform.defaults.json`;
see `apps/_example/app.config.json` for every option set.

| Key | Meaning |
|---|---|
| `appId` | Android package name, e.g. `com.mycompany.myshop`. Unique per app; **never change after you ship** (it is the app's identity) |
| `appName` | Name under the launcher icon |
| `version.name` / `version.code` | Shown version / integer that **must increase** for each release you install over an older one |
| `server.url` | The site, e.g. `https://192.168.1.10:8443`. IP and any port are fine |
| `server.allowNavigation` | Extra hostnames that stay *inside* the app (other hosts open in the phone's browser) |
| `server.cleartext` | Forced `true` automatically when the URL is `http://` |
| `ssl.allowSelfSigned` | Accept the server's self-signed certificate (only for the configured host) |
| `ssl.pinSha256` | Accept **only** this exact certificate (`platform pin --save` fills it). Strongly recommended |
| `branding.icon` / `splash` / `splashDark` | Paths relative to the app folder |
| `branding.iconBackgroundColor(Dark)` | Background of the adaptive icon (behind your icon) |
| `branding.splashBackgroundColor(Dark)` | Splash background; also window background while loading |
| `splash.*` | `autoHide`, `showDurationMs`, `fadeOutMs`, `showSpinner`, `scaleType` (`CENTER_CROP`, `CENTER_INSIDE`, …) |
| `statusBar.*` | `style` (`DARK`/`LIGHT`/`DEFAULT`), `backgroundColor`, `overlaysWebView` |
| `android.orientation` | `default`, `portrait`, `landscape`, `sensorPortrait`, `sensorLandscape`, … |
| `android.permissions` | e.g. `["CAMERA","POST_NOTIFICATIONS","ACCESS_FINE_LOCATION"]` (INTERNET is always added) |
| `android.minSdk/targetSdk/compileSdk` | Override Capacitor's defaults (`null` = keep) |
| `android.keepScreenOn`, `secureWindow` | Stop screen sleep / block screenshots (FLAG_SECURE) |
| `android.webDebugging` | Allow `chrome://inspect` debugging – keep `false` for release |
| `android.userAgentSuffix` | Appended to the User-Agent so Laravel can recognise the app |
| `android.offlinePage` | Show a built-in "can't reach server – Try again" page instead of Chrome's error |
| `extraPlugins` | More Capacitor plugins, e.g. `["@capacitor/camera"]` (run `npm install @capacitor/camera` in the platform folder first) |
| `googleLogin.enabled` / `webClientId` | Adds the native Google sign-in plugin to this app ([Google login](05-google-login.md)) |

Examples of per-app variety: one app portrait-only with camera permission, another landscape tablet kiosk with
`keepScreenOn`, a third `http://` LAN-only app with no SSL at all – each is just a different `app.config.json`.

## Icon and splash screen

* `icon.png` – 1024×1024 PNG, keep the important artwork inside the centre ~60 % (Android crops adaptive icons into circles/squircles). Opaque or transparent both work; transparency shows `iconBackgroundColor`.
* `splash.png` – 2732×2732 PNG, logo centred and ≤ ~1200 px wide; the rest is cropped on different screens.
* `splashDark` – optional dark-mode splash, otherwise `splash.png` is used.
* All Android densities and the Android 12+ splash are generated for you by `@capacitor/assets`.

Placeholders (a coloured ring) are created by `platform new` so the first build works immediately.
