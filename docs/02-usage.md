[← README](../README.md) · Prev: [Install](01-install-tools.md) · Next: [App configuration](03-app-config.md)

# Usage

## Quick start – first app

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

## Day-to-day workflows

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

## Installing on a phone

* **File copy**: send the APK to the phone, open it, allow "install unknown apps" for that file manager/browser.
* **USB**: enable USB debugging → `.\platform devices` (accept the prompt on the phone) → `.\platform install myshop`.
