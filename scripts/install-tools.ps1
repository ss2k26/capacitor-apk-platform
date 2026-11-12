<#
  Installs everything the platform needs on Windows 10:
    Node.js LTS, JDK 21 (Temurin), Android SDK command-line tools + platform-tools + build-tools + platform,
    sets JAVA_HOME / ANDROID_HOME / PATH, accepts SDK licenses, enables Windows long paths (if admin).

  Run from PowerShell (right-click > "Run as administrator" is recommended, but not required):
      Set-ExecutionPolicy -Scope Process Bypass
      .\scripts\install-tools.ps1

  Options:
      -SdkRoot C:\Android\sdk
      -CmdlineToolsBuild 14742923     # the number in commandlinetools-win-<N>_latest.zip, see https://developer.android.com/studio#command-line-tools-only
      -SkipNode -SkipJdk
#>
param(
  [string]$SdkRoot = 'C:\Android\sdk',
  [string]$CmdlineToolsBuild = '14742923',
  [string]$AndroidPlatform = 'android-36',
  [string]$BuildTools = '36.0.0',
  [switch]$SkipNode,
  [switch]$SkipJdk
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  !   $m" -ForegroundColor Yellow }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

function Install-WithWinget($id, $label) {
  if (-not $hasWinget) { throw "winget not found. Install $label manually (see GUIDE.md section 2) and re-run this script with the matching -Skip switch." }
  winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) { throw "winget failed for $label (exit $LASTEXITCODE)" }
}

# ---- Node.js ---------------------------------------------------------------
if (-not $SkipNode) {
  Step 'Node.js LTS'
  $nodeOk = $false
  try { $v = (& node --version) 2>$null; if ($v -match '^v(\d+)' -and [int]$Matches[1] -ge 22) { $nodeOk = $true; Ok "already installed ($v)" } } catch {}
  if (-not $nodeOk) { Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js LTS'; Ok 'installed (open a NEW terminal afterwards so PATH refreshes)' }
}

# ---- JDK -------------------------------------------------------------------
$javaHome = $null
if (-not $SkipJdk) {
  Step 'JDK 21 (Eclipse Temurin)'
  $cand = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $cand) { Install-WithWinget 'EclipseAdoptium.Temurin.21.JDK' 'Temurin JDK 21' }
  $cand = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $cand) { throw 'JDK 21 not found after install.' }
  $javaHome = $cand.FullName
  Ok $javaHome
} elseif ($env:JAVA_HOME) { $javaHome = $env:JAVA_HOME }

if ($javaHome) {
  [Environment]::SetEnvironmentVariable('JAVA_HOME', $javaHome, 'User')
  $env:JAVA_HOME = $javaHome
}

# ---- Android command-line tools -------------------------------------------
Step "Android SDK in $SdkRoot"
New-Item -ItemType Directory -Force -Path $SdkRoot | Out-Null
$sdkmanager = Join-Path $SdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkmanager)) {
  $zip = Join-Path $env:TEMP "cmdline-tools-$CmdlineToolsBuild.zip"
  $url = "https://dl.google.com/android/repository/commandlinetools-win-${CmdlineToolsBuild}_latest.zip"
  Write-Host "  downloading $url"
  try { Invoke-WebRequest -Uri $url -OutFile $zip } catch {
    throw "Download failed. Open https://developer.android.com/studio#command-line-tools-only , copy the current Windows zip build number and run again with -CmdlineToolsBuild <number>. ($_)"
  }
  $tmp = Join-Path $env:TEMP 'cmdline-tools-extract'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $dest = Join-Path $SdkRoot 'cmdline-tools\latest'
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Move-Item (Join-Path $tmp 'cmdline-tools') $dest
  Remove-Item $zip -Force
  Ok 'command-line tools installed'
} else { Ok 'command-line tools already present' }

[Environment]::SetEnvironmentVariable('ANDROID_HOME', $SdkRoot, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $SdkRoot, 'User')
$env:ANDROID_HOME = $SdkRoot; $env:ANDROID_SDK_ROOT = $SdkRoot

# ---- PATH -----------------------------------------------------------------
Step 'PATH'
$add = @("$SdkRoot\platform-tools", "$SdkRoot\cmdline-tools\latest\bin")
if ($javaHome) { $add += "$javaHome\bin" }
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User'); if (-not $userPath) { $userPath = '' }
foreach ($p in $add) {
  if (($userPath -split ';') -notcontains $p) { $userPath = ($userPath.TrimEnd(';') + ';' + $p).TrimStart(';'); Ok "added $p" }
  if (($env:Path -split ';') -notcontains $p) { $env:Path += ";$p" }
}
[Environment]::SetEnvironmentVariable('Path', $userPath, 'User')

# ---- SDK packages & licenses ------------------------------------------------
Step 'Accepting SDK licenses'
(1..40 | ForEach-Object { 'y' }) | & $sdkmanager --licenses | Out-Null
Ok 'licenses accepted'

Step "Installing SDK packages (platform-tools, $AndroidPlatform, build-tools $BuildTools)"
& $sdkmanager "platform-tools" "platforms;$AndroidPlatform" "build-tools;$BuildTools"
if ($LASTEXITCODE -ne 0) {
  Warn 'sdkmanager reported an error for one of the packages (version may have changed).'
  Warn 'This is not fatal: Gradle downloads the exact versions it needs on the first build.'
}

# ---- Long paths -------------------------------------------------------------
Step 'Windows long paths'
if ($isAdmin) {
  New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'LongPathsEnabled' -Value 1 -PropertyType DWORD -Force | Out-Null
  Ok 'enabled (reboot recommended)'
} else {
  Warn 'Not running as administrator: long paths not enabled. Re-run as admin, or keep the platform in a short folder like C:\apkplatform.'
}

Write-Host "`nDone. CLOSE this terminal and open a new one, then run:  platform doctor" -ForegroundColor Green
