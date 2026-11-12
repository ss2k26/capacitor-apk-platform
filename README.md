# Capacitor APK Platform

Build many Android `.apk` apps on **Windows 10** from one folder. Each app is a thin native shell
([Capacitor](https://capacitorjs.com)) around a website, typically a Laravel app, reached by **IP + custom port +
self-signed SSL**, with its own URL, name, icon, splash screen and settings.

* One command per job: `platform new`, `platform build`, `platform pin`, `platform keystore` …
* One config file per app: `apps/<name>/app.config.json`
* Self-signed HTTPS accepted **only** for your host, optionally pinned to the exact certificate
* Google login for Laravel Socialite apps via native sign-in (the web redirect flow is blocked inside apps)
* Release signing, AAB output, USB install, built-in "server unreachable" page

> **Status:** the CLI, config validation, certificate pinning, keystore/SHA-1 commands and the Android patching
> logic were tested in a Linux sandbox. The Capacitor/Gradle build itself needs the Android SDK and internet, which
> that sandbox did not have, so your first `platform build` is the real end-to-end test.
> See [Troubleshooting](docs/07-troubleshooting.md) if it fails.

## Quick start

```powershell
# 1. Put this folder at a short path, e.g. C:\apkplatform, then (PowerShell as Administrator):
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-tools.ps1          # Node 22, JDK 21, Android SDK (once). Then open a NEW terminal.

# 2. Install the platform's packages and check the setup
npm install
.\platform doctor

# 3. Create, pin and build your first app
.\platform new myshop --url https://192.168.1.10:8443 --title "My Shop" --id com.mycompany.myshop
.\platform pin myshop --save         # self-signed certificate: read it from the server and pin it
.\platform build myshop              # -> output\myshop\myshop-1.0.0-1-debug.apk
```

Replace `apps\myshop\assets\icon.png` (1024×1024) and `splash.png` (2732×2732) with your artwork and build again.

## Requirements

Windows 10 (64-bit), about 6 GB free disk space, internet for the first build (Gradle downloads dependencies).
Node.js 22+, JDK 21 and the Android SDK are installed by `scripts\install-tools.ps1`
or by hand ([Install guide](docs/01-install-tools.md)).

## Documentation

| # | Document | What's inside |
|---|---|---|
| 1 | [Install the tooling](docs/01-install-tools.md) | Automatic script, manual install, environment variables, `platform doctor` |
| 2 | [Usage](docs/02-usage.md) | Quick start, every command, day-to-day workflows, installing on a phone |
| 3 | [App configuration](docs/03-app-config.md) | All `app.config.json` options, icon and splash screen rules |
| 4 | [Self-signed SSL](docs/04-self-signed-ssl.md) | Certificate for an IP, nginx example, pinning, limitations |
| 5 | [Google login](docs/05-google-login.md) | Why Socialite redirects fail in apps, native sign-in, Google Cloud setup, Laravel code |
| 6 | [Release & signing](docs/06-release-signing.md) | Keystore, release APK/AAB, versioning, security notes |
| 7 | [Troubleshooting](docs/07-troubleshooting.md) | Common errors and fixes |

## How it works

```
capacitor-platform/
├─ README.md
├─ platform.cmd            the command you run (platform <command>)
├─ platform.defaults.json  default values every app inherits
├─ package.json            Capacitor + plugins, installed once for all apps
├─ docs/                   documentation
├─ scripts/install-tools.ps1   installs Node, JDK, Android SDK on Windows
├─ apps/
│  ├─ _example/            every config option, as an example
│  └─ myshop/              one folder per app
│     ├─ app.config.json   URL, name, version, SSL, colours, permissions, Google login …
│     ├─ assets/           icon.png, splash.png
│     └─ keystore.properties + myshop.jks   release key (created by "platform keystore", keep secret)
├─ templates/              Android code templates (SSL handler, offline page)
├─ tools/                  the CLI source
├─ build/<app>/            generated Capacitor + Android project (disposable)
└─ output/<app>/           your finished .apk files
```

`platform build myshop` validates the config, creates a throw-away Capacitor project in `build/myshop`, generates
icons and splash screens, syncs Capacitor, patches the Android project (manifest, version, signing, SSL handler),
runs Gradle and copies the APK to `output/myshop/`.

The app's WebView opens `server.url`. Nothing of your Laravel app is bundled, so site changes never need a new APK;
only changes to the shell (icon, URL, permissions, certificate pin) do.

## Commands at a glance

```
platform doctor                       check Node / JDK / Android SDK / dependencies
platform list                         list apps
platform new <name> --url <URL>       create apps/<name>
platform validate <name>              check config, show warnings
platform pin <name> [--save]          read + pin the server's certificate
platform build <name> [--release] [--aab] [--clean]
platform prepare <name>               generate Android project only (open in Android Studio)
platform keystore <name>              create release signing key
platform sha1 <name> [--debug]        signing-key fingerprints (Google Cloud)
platform install <name> [--release]   install on USB phone      platform devices
platform clean <name|--all>           delete build workspaces
```

Details: [Usage](docs/02-usage.md).
