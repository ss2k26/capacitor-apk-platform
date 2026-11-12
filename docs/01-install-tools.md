[← README](../README.md) · Next: [Usage](02-usage.md)

# Install the external tooling (once)

You need: **Node.js 22+**, **JDK 21**, **Android SDK** (command-line tools are enough, Android Studio is optional).

## Automatic (recommended)

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

Windows 10 without `winget`? Install "App Installer" from the Microsoft Store, or use the manual steps below.

## Manual

| Tool | How |
|---|---|
| Node.js 22 LTS | <https://nodejs.org> → LTS installer. Check: `node --version` |
| JDK 21 | <https://adoptium.net> → Temurin 21 → `.msi` (tick *Set JAVA_HOME* and *Add to PATH*). Check: `java -version` |
| Android SDK | Either install **Android Studio** (<https://developer.android.com/studio>, SDK lands in `%LOCALAPPDATA%\Android\Sdk`) **or** download *Command line tools only*, extract so you get `C:\Android\sdk\cmdline-tools\latest\bin\sdkmanager.bat` |
| Environment variables | `ANDROID_HOME=C:\Android\sdk` (or the Android Studio path). Add `%ANDROID_HOME%\platform-tools` to `Path` |
| SDK packages | `sdkmanager --licenses` (answer `y`), then `sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"` |
| Long paths | Admin PowerShell: `New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`, then reboot |
| USB install (optional) | Phone: Settings → About → tap *Build number* 7× → Developer options → *USB debugging* |

## Install the platform's own packages

```powershell
cd C:\apkplatform
npm install
.\platform doctor
```

`platform doctor` must end with **"Everything needed is in place"**. It tells you exactly what is missing.
(Tip: add the folder to `Path`, or just run `.\platform` from inside it.)
