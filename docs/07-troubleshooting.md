[← README](../README.md) · Prev: [Release & signing](06-release-signing.md)

# Troubleshooting

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
| Google login: `disallowed_useragent` | You are using the web Socialite flow inside the app; use the native button from [Google login](05-google-login.md) |
| "App not installed" over an older version | Different signing key or lower `version.code`; uninstall first |
| `npm install` fails | Behind a proxy: `npm config set proxy …`; or antivirus blocking `sharp` downloads |
