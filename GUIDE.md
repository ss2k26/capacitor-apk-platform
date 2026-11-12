# Capacitor APK Platform – Guide

Build many Android `.apk` apps on **Windows 10**, each one a thin native shell (Capacitor) around a website
(typically a Laravel app) reached by **IP + custom port + self-signed SSL**. One platform folder, one folder per app.

> Status note: the CLI, config validation, certificate pinning, keystore/SHA-1 commands and the Android
> patching logic were tested in a Linux sandbox. The Capacitor/Gradle build itself needs the Android SDK and
> internet, which that sandbox did not have, so **your first `platform build` is the real end-to-end test**.
> Section 11 lists what to check if something fails.

---

## 1. How it works

```
capacitor-platform/
├─ platform.cmd            ← the command you run (platform <command>)
├─ platform.defaults.json  ← default values every app inherits
├─ package.json            ← Capacitor + plugins, installed ONCE for all apps
├─ apps/
│  ├─ _example/            ← fully commented-by-example config (copy ideas from it)
│  └─ myshop/              ← one folder per app
│     ├─ app.config.json   ← URL, name, version, SSL, colours, permissions, Google login ...
│     ├─ assets/icon.png   ← 1024×1024
│     ├─ assets/splash.png ← 2732×2732
│     └─ keystore.properties + myshop.jks   (created by "platform keystore", keep secret)
├─ templates/              ← Android code templates (self-signed SSL handler, offline page)
├─ tools/                  ← the CLI source
├─ build/<app>/            ← generated Capacitor + Android project (disposable)
└─ output/<app>/           ← your finished .apk files
```

`platform build myshop` does, in order: validates the config → creates a throw-away Capacitor project in
`build/myshop` → generates icons/splash → `cap sync` → patches the Android project (manifest, version,
signing, SSL handler) → runs Gradle → copies the APK to `output/myshop/`.

The app itself is a native shell whose WebView opens `server.url`. Nothing of your Laravel app is bundled; it
always shows the live site, exactly like a browser, but with an icon, a splash screen, and no address bar.

---

## 2. Install the external tooling (once)

You need: **Node.js 22+**, **JDK 21**, **Android SDK** (command-line tools are enough, Android Studio is optional).

### 2a. Automatic (recommended)

1. Copy this folder to a **short path**, e.g. `C:\apkplatform` (Windows path-length limits break deep Gradle paths).
2. Open **PowerShell as Administrator** in that folder:
   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\scripts\install-tools.ps1
   ```
   It installs Node LTS and Temurin JDK 21 through `winget`, downloads the Android command-line tools from
   dl.google.com into `C:\Android\sdk`, sets `JAVA_HOME`, `ANDROID_HOME`, `PATH`, accepts the SDK licences,
   installs `platform-tools`, an Android platform and build-tools, and enables Windows long paths.
3. **Close the terminal and open a new one.**

If the Google download fails, open <https://developer.android.com/studio#command-line-tools-only>, read the
number in `commandlinetools-win-<NUMBER>_latest.zip` and run `.\scripts\install-tools.ps1 -CmdlineToolsBuild <NUMBER>`.

Windows 10 without `winget`? Install "App Installer" from the Microsoft Store, or use 2b.

### 2b. Manual

| Tool | How |
|---|---|
| Node.js 22 LTS | <https://nodejs.org> → LTS installer. Check: `node --version` |
| JDK 21 | <https://adoptium.net> → Temurin 21 → `.msi` (tick *Set JAVA_HOME* and *Add to PATH*). Check: `java -version` |
| Android SDK | Either install **Android Studio** (<https://developer.android.com/studio>, SDK lands in `%LOCALAPPDATA%\Android\Sdk`) **or** download *Command line tools only*, extract so you get `C:\Android\sdk\cmdline-tools\latest\bin\sdkmanager.bat` |
| Environment variables | `ANDROID_HOME=C:\Android\sdk` (or the Android Studio path). Add `%ANDROID_HOME%\platform-tools` to `Path` |
| SDK packages | `sdkmanager --licenses` (answer `y`), then `sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"` |
| Long paths | Admin PowerShell: `New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`, then reboot |
| USB install (optional) | Phone: Settings → About → tap *Build number* 7× → Developer options → *USB debugging* |

### 2c. Install the platform's own packages

```powershell
cd C:\apkplatform
npm install
.\platform doctor
```

`platform doctor` must end with **"Everything needed is in place"**. It tells you exactly what is missing.
(Tip: add the folder to `Path`, or just run `.\platform` from inside it.)

---

## 3. Quick start – first app

```powershell
.\platform new myshop --url https://192.168.1.10:8443 --title "My Shop" --id com.mycompany.myshop
.\platform pin myshop --save        # self-signed cert: reads the server certificate and pins it
.\platform build myshop             # debug APK, installable right away
```

Result: `output\myshop\myshop-1.0.0-1-debug.apk`. Copy it to the phone, or with USB debugging on:
`.\platform install myshop`.

Replace `apps\myshop\assets\icon.png` and `splash.png` with your artwork, run `platform build myshop` again.

### Command reference

| Command | Purpose |
|---|---|
| `platform doctor` | Check Node, JDK, Android SDK, licences, dependencies |
| `platform list` | List apps with ID, version, URL |
| `platform new <name> --url <URL> [--id ..] [--title ".."] [--self-signed]` | Create an app folder with placeholder icon/splash |
| `platform validate <name>` | Validate config, show warnings |
| `platform pin <name> [--save]` | Show the server certificate and its SHA-256; `--save` writes it into the config |
| `platform build <name> [--release] [--aab] [--clean]` | Build. Default is a debug APK. `--release` = signed release APK. `--aab` = Play Store bundle. `--clean` = rebuild from scratch |
| `platform prepare <name>` | Generate only the Android project (`build\<name>\android`) to open in Android Studio |
| `platform keystore <name>` | Create the release signing key |
| `platform sha1 <name> [--debug]` | Print SHA-1/SHA-256 of the signing key (Google login) |
| `platform install <name> [--release]` / `platform devices` | Install via `adb` / list phones |
| `platform clean <name>` / `platform clean --all` | Delete build workspaces (APKs in `output\` are kept) |

---

## 4. Per-app configuration (`apps/<name>/app.config.json`)

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
| `googleLogin.enabled` / `webClientId` | Adds the native Google sign-in plugin to this app (section 7) |

Examples of per-app variety: one app portrait-only with camera permission, another landscape tablet kiosk with
`keepScreenOn`, a third `http://` LAN-only app with no SSL at all – each is just a different `app.config.json`.

---

## 5. Icon and splash screen

* `icon.png` – 1024×1024 PNG, keep the important artwork inside the centre ~60 % (Android crops adaptive icons into circles/squircles). Opaque or transparent both work; transparency shows `iconBackgroundColor`.
* `splash.png` – 2732×2732 PNG, logo centred and ≤ ~1200 px wide; the rest is cropped on different screens.
* `splashDark` – optional dark-mode splash, otherwise `splash.png` is used.
* All Android densities and the Android 12+ splash are generated for you by `@capacitor/assets`.

Placeholders (a coloured ring) are created by `platform new` so the first build works immediately.

---

## 6. Self-signed SSL on an IP address with a custom port

### 6a. What the app does
With `ssl.allowSelfSigned: true`, the native WebView handler accepts certificate errors **only** for the
configured host, and, when `ssl.pinSha256` is set, **only** if the certificate's SHA-256 fingerprint equals the pin.
Everything else (other hosts, a swapped certificate) is rejected. This is much safer than "ignore all SSL errors".

Consequences: when you **renew or regenerate** the certificate, run `platform pin <name> --save` and ship a new build.
Use a long validity (e.g. 3650 days) to avoid frequent rebuilds.

### 6b. Create a certificate that is valid for an IP (once per server)

Modern TLS stacks want the IP in `subjectAltName`. With OpenSSL (Git for Windows ships `openssl.exe`):

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
  -keyout server.key -out server.crt \
  -subj "/CN=192.168.1.10" \
  -addext "subjectAltName=IP:192.168.1.10"
```

Use `server.crt` / `server.key` in your web server, e.g. nginx:

```nginx
server {
    listen 8443 ssl;
    server_name 192.168.1.10;
    ssl_certificate     /etc/ssl/myshop/server.crt;
    ssl_certificate_key /etc/ssl/myshop/server.key;
    root /var/www/myshop/public;
    # ... usual Laravel/php-fpm config
}
```

Laravel: set `APP_URL=https://192.168.1.10:8443` and make sure it trusts the proxy headers
(`TrustProxies`) if TLS ends at nginx, otherwise generated URLs and redirects fall back to `http://`.

### 6c. Pin it

```powershell
.\platform pin myshop --save
```
Prints subject, validity, SAN and SHA-256, and writes `allowSelfSigned: true` + the pin into the config.
Rebuild afterwards. If the phone cannot reach the server, the app shows the built-in offline page with a retry button.

### 6d. What does *not* work
* The cert must be reachable **from the phone** (same Wi-Fi / VPN). A private IP is not reachable from mobile data.
* Other apps and Chrome on the phone still distrust the cert; only this app accepts it. (Optional: install the cert as a user CA in Android settings – not needed for this platform.)
* Self-signed certs cannot be used for Google OAuth redirects, see 7.

---

## 7. Google login (Laravel Socialite)

### 7a. The problem
Google **blocks OAuth inside embedded WebViews** (`Error 403: disallowed_useragent`). Also Google OAuth web clients
do not accept raw IP addresses as redirect URIs. So the usual Socialite redirect flow cannot run inside the app on
`https://192.168.x.x:8443`.

### 7b. The solution used here: native Google sign-in + ID-token endpoint
The app shows Android's native account picker (via `@capgo/capacitor-social-login`, Credential Manager),
receives a Google **ID token**, and POSTs it to a Laravel route that verifies it and logs the user in.
No redirect URI, no browser, works with IP + self-signed. Your normal browser Socialite flow stays untouched.

Enable per app:
```json
"googleLogin": { "enabled": true, "webClientId": "1234567890-xxxx.apps.googleusercontent.com" }
```
(`enabled` adds the plugin and the required `MainActivity` hook for that app only.)

### 7c. Google Cloud Console (once per Google project)
1. APIs & Services → OAuth consent screen: configure it (Testing mode is fine for a few users – add them as test users).
2. Credentials → *Create OAuth client ID* → **Web application**. No redirect URI needed for this flow. Copy the **client ID** → `webClientId` and Laravel `GOOGLE_CLIENT_ID`. (Your existing Socialite web client can be reused.)
3. Credentials → *Create OAuth client ID* → **Android**: package name = the app's `appId`; SHA-1 = from
   `.\platform sha1 myshop` (release key) and/or `.\platform sha1 myshop --debug` (debug key).
   Debug and release builds are signed by different keys → register an Android client for each you use.
   It must be in the **same Google Cloud project** as the Web client.
4. Wait a few minutes. Error `28444`/"Developer console is not set up correctly" = package name or SHA-1 mismatch, or different projects.

### 7d. Laravel side

```bash
composer require google/apiclient
```

`routes/web.php` (keep it in the `web` group so the session cookie is set):
```php
Route::post('/auth/google/native', [NativeGoogleLoginController::class, 'login'])->name('google.native');
```

`app/Http/Controllers/NativeGoogleLoginController.php`:
```php
<?php

namespace App\Http\Controllers;

use App\Models\User;
use Google\Client as GoogleClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class NativeGoogleLoginController extends Controller
{
    public function login(Request $request)
    {
        $request->validate(['idToken' => 'required|string']);

        // audience must be your WEB client id
        $client  = new GoogleClient(['client_id' => config('services.google.client_id')]);
        $payload = $client->verifyIdToken($request->string('idToken')); // false when invalid/expired

        if (!$payload || empty($payload['email']) || !($payload['email_verified'] ?? false)) {
            return response()->json(['message' => 'Invalid Google token'], 422);
        }

        // Use the same lookup your Socialite callback uses:
        $user = User::where('google_id', $payload['sub'])->orWhere('email', $payload['email'])->first()
            ?? User::create([
                'name'      => $payload['name'] ?? $payload['email'],
                'email'     => $payload['email'],
                'google_id' => $payload['sub'],
                'password'  => bcrypt(Str::random(40)),
            ]);
        if (!$user->google_id) { $user->forceFill(['google_id' => $payload['sub']])->save(); }

        Auth::login($user, true);
        $request->session()->regenerate();

        return response()->json(['redirect' => url('/home')]);
    }
}
```
`config/services.php` → `'google' => ['client_id' => env('GOOGLE_CLIENT_ID'), ...]` (already there if you use Socialite).
Adapt the user model/columns to your app. The server needs outbound internet once in a while (to fetch Google's public keys).

### 7e. Login page JavaScript
The native plugin is injected into pages loaded by the app, so no bundling is needed:

```html
<button id="google-native" style="display:none">Sign in with Google</button>
<a id="google-web" href="{{ route('auth.google') }}">Sign in with Google</a>   {{-- existing Socialite link --}}

<script>
(async () => {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;   // normal browser: keep Socialite link
  const SocialLogin = cap.Plugins.SocialLogin;
  document.getElementById('google-web').style.display = 'none';
  const btn = document.getElementById('google-native');
  btn.style.display = '';

  await SocialLogin.initialize({ google: { webClientId: '{{ config('services.google.client_id') }}', mode: 'online' } });

  btn.onclick = async () => {
    try {
      const { result } = await SocialLogin.login({ provider: 'google', options: {} });
      if (!result.idToken) throw new Error('No ID token');
      const res = await fetch('{{ route('google.native') }}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json',
                   'X-CSRF-TOKEN': document.querySelector('meta[name=csrf-token]').content },
        body: JSON.stringify({ idToken: result.idToken }),
      });
      const data = await res.json();
      if (res.ok) location.href = data.redirect; else alert(data.message || 'Login failed');
    } catch (e) { if (e && e.code !== 'USER_CANCELLED') alert(e.message || e); }
  };
})();
</script>
```
(Needs `<meta name="csrf-token" content="{{ csrf_token() }}">` in your layout.)

If `Capacitor.Plugins.SocialLogin` is undefined in your build, the plugin was not added: check `googleLogin.enabled`
and that `platform build` printed no errors; as a fallback you can bundle `@capgo/capacitor-social-login` into your
site's JS instead.

> The Google plugin's Android API changes between versions. If the Java compile fails on `MainActivity`
> (step "Running Gradle"), compare the generated `build\<app>\android\app\src\main\java\...\MainActivity.java`
> with the plugin's Android setup page (<https://capgo.app/docs/plugins/social-login/getting-started/>) and adjust
> `tools/lib/patch.js` (`EXTRA_MEMBERS`). Apps without Google login are unaffected.

### 7f. Alternative: system browser (Custom Tab)
Possible only with a public **domain** + valid HTTPS redirect URI registered in Google. Not covered, as it does not fit IP + self-signed.

---

## 8. Release build and signing

Debug APKs are fine for testing and sideloading. For a proper release:

```powershell
.\platform keystore myshop        # once; creates apps\myshop\myshop.jks + keystore.properties
.\platform build myshop --release
```
**Back up the `.jks` and `keystore.properties`.** Android only installs an update over an existing app if it is signed by
the same key. Before each new release, increase `version.code` (and `version.name`) in the config.
`--aab` produces an `.aab` for Google Play.

Note that debug and release builds are signed with different keys, so you cannot install one over the other; uninstall first.

---

## 9. Installing on a phone

* **File copy**: send the APK to the phone, open it, allow "install unknown apps" for that file manager/browser.
* **USB**: enable USB debugging → `.\platform devices` (accept the prompt on the phone) → `.\platform install myshop`.

---

## 10. Day-to-day workflows

| Goal | Do |
|---|---|
| New app | `platform new shop2 --url https://10.0.0.7:9443 --self-signed`, `platform pin shop2 --save`, `platform build shop2` |
| Change URL/name/colours | Edit `app.config.json`, `platform build <name>` |
| Change icon/splash | Replace PNGs, `platform build <name>` (regenerated automatically) |
| Change `appId` | Allowed before shipping; the Android project is recreated automatically |
| Release update | Bump `version.code`, `platform build <name> --release` |
| Server certificate renewed | `platform pin <name> --save`, rebuild, reinstall |
| Something weird | `platform build <name> --clean` |
| Add a native feature (camera, push, …) | `npm install @capacitor/camera`, add to `extraPlugins` and `permissions` |
| Open in Android Studio | `platform prepare <name>`, then *Open* `build\<name>\android` |

Changes to your Laravel site never require a new APK. Only changes to the shell (icon, URL, permissions, pin) do.

---

## 11. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `platform doctor` says SDK/JDK not found | Open a **new** terminal after installing; check `echo %ANDROID_HOME%`, `java -version` |
| `Failed to install the following SDK components… licences` | `sdkmanager --licenses` and answer `y` |
| Gradle: "Unsupported class file major version" / Java version error | You are on a different JDK; set `JAVA_HOME` to JDK 21 |
| Path too long errors | Move the platform to `C:\apkplatform`, enable long paths, or `set PLATFORM_BUILD_DIR=C:\b` (same drive as the platform) |
| App shows the "Can't reach the server" page | Phone not on the same network/VPN, wrong port, firewall, server down. Open the URL in the phone's Chrome to compare |
| App shows offline page for an https URL but Chrome works | Certificate not accepted: `ssl.allowSelfSigned` false, or pin out of date (`platform pin <name> --save`, rebuild) |
| Blank page / mixed-content issues | Laravel generating `http://` asset URLs behind nginx: set `APP_URL` and trusted proxies; avoid `android.allowMixedContent` |
| Logged out again and again | Cookies need `SESSION_SECURE_COOKIE=true` with https and a stable `APP_URL`; `SESSION_DOMAIN` must not be set to a different host |
| File upload / camera does nothing | Add the permission in `android.permissions`; some features also need the matching Capacitor plugin |
| Google login: error 28444 | Package name or SHA-1 not registered for the key used (debug vs release), or clients in different projects |
| Google login: `disallowed_useragent` | You are using the web Socialite flow inside the app; use the native button from 7e |
| "App not installed" over an older version | Different signing key or lower `version.code`; uninstall first |
| `npm install` fails | Behind a proxy: `npm config set proxy …`; or antivirus blocking `sharp` downloads |

---

## 12. Security notes

* Pinned self-signed certificates are safe for private networks; an unpinned `allowSelfSigned` accepts any certificate for that host (the CLI warns).
* Never commit `*.jks` or `keystore.properties` (the provided `.gitignore` excludes them).
* Keep `android.webDebugging` off for builds you distribute.
* Google ID tokens must always be verified on the server (done in 7d); never trust the email sent by the client.
