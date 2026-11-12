'use strict';
// Locates JDK / Android SDK and runs the environment checks (platform doctor).
const os = require('os');
const path = require('path');
const fs = require('fs');
const { ROOT, IS_WIN, exists, run, log, col } = require('./util');

function findSdk() {
  const cands = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    IS_WIN && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    IS_WIN && 'C:\\Android\\sdk',
    path.join(os.homedir(), 'Android', 'Sdk'),
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  ].filter(Boolean);
  return cands.find((p) => exists(p)) || null;
}

function findJavaHome() {
  if (process.env.JAVA_HOME && exists(path.join(process.env.JAVA_HOME, 'bin', IS_WIN ? 'java.exe' : 'java'))) return process.env.JAVA_HOME;
  if (IS_WIN) {
    const roots = ['C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java', 'C:\\Program Files\\Microsoft', 'C:\\Program Files\\Android\\Android Studio\\jbr'];
    for (const r of roots) {
      if (!exists(r)) continue;
      if (exists(path.join(r, 'bin', 'java.exe'))) return r;
      const subs = fs.readdirSync(r).filter((d) => /jdk/i.test(d)).sort().reverse();
      for (const s of subs) if (exists(path.join(r, s, 'bin', 'java.exe'))) return path.join(r, s);
    }
  }
  return null;
}

function javaVersion(javaHome) {
  const bin = javaHome ? path.join(javaHome, 'bin', 'java') : 'java';
  const r = run(bin, ['-version'], { capture: true, allowFail: true });
  const out = `${r.stderr || ''}${r.stdout || ''}`;
  const m = out.match(/version "(\d+)(?:\.(\d+))?/);
  if (r.error || !m) return null;
  return m[1] === '1' ? Number(m[2]) : Number(m[1]);
}

/** Environment variables for child processes (Gradle etc.). */
function toolEnv() {
  const env = {};
  const jh = findJavaHome();
  const sdk = findSdk();
  if (jh) { env.JAVA_HOME = jh; env.PATH = `${path.join(jh, 'bin')}${path.delimiter}${process.env.PATH}`; }
  if (sdk) { env.ANDROID_HOME = sdk; env.ANDROID_SDK_ROOT = sdk; }
  return env;
}

function adbPath() {
  const sdk = findSdk();
  const p = sdk && path.join(sdk, 'platform-tools', IS_WIN ? 'adb.exe' : 'adb');
  return p && exists(p) ? p : 'adb';
}

function keytoolPath() {
  const jh = findJavaHome();
  return jh ? path.join(jh, 'bin', 'keytool') : 'keytool';
}

function doctor() {
  let problems = 0;
  const bad = (m) => { problems++; log.bad(m); };

  log.step('Platform doctor');

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  nodeMajor >= 22 ? log.ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node} is too old – install Node 22 LTS or newer.`);

  const capCli = path.join(ROOT, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
  exists(capCli) ? log.ok('Capacitor CLI installed (npm install done)') : bad('Dependencies missing – run "npm install" in this folder.');
  const assets = path.join(ROOT, 'node_modules', '@capacitor', 'assets');
  exists(assets) ? log.ok('@capacitor/assets installed (icon/splash generation)') : log.warn('@capacitor/assets not installed – icons/splash cannot be generated (run npm install).');

  const jh = findJavaHome();
  const jv = javaVersion(jh);
  if (jv == null) bad('Java (JDK) not found. Install Temurin JDK 21 and set JAVA_HOME (see docs/01-install-tools.md).');
  else if (jv < 17) bad(`Java ${jv} found – too old. Install JDK 21.`);
  else if (jv < 21) { log.ok(`Java ${jv} (${jh || 'PATH'})`); log.warn('Capacitor 8 targets Java 21. If the build complains about the Java version, install JDK 21.'); }
  else log.ok(`Java ${jv} (${jh || 'PATH'})`);
  if (!process.env.JAVA_HOME && jh) log.warn(`JAVA_HOME is not set; using ${jh} automatically.`);

  const kt = run(keytoolPath(), ['-help'], { capture: true, allowFail: true });
  !kt.error && kt.status !== null ? log.ok('keytool available (release signing)') : bad('keytool not found (comes with the JDK).');

  const sdk = findSdk();
  if (!sdk) bad('Android SDK not found. Install it and set ANDROID_HOME (see docs/01-install-tools.md).');
  else {
    log.ok(`Android SDK: ${sdk}`);
    const sub = (p) => exists(path.join(sdk, ...p));
    sub(['platform-tools']) ? log.ok('platform-tools (adb) present') : log.warn('platform-tools missing: needed for "platform install". sdkmanager "platform-tools"');
    const plats = sub(['platforms']) ? fs.readdirSync(path.join(sdk, 'platforms')) : [];
    plats.length ? log.ok(`SDK platforms: ${plats.join(', ')}`) : log.warn('No SDK platform installed yet – Gradle will try to download one on first build (licenses must be accepted).');
    sub(['build-tools']) ? log.ok('build-tools present') : log.warn('build-tools missing – Gradle will download them on first build.');
    sub(['licenses']) ? log.ok('SDK licenses accepted') : bad('SDK licenses not accepted. Run: sdkmanager --licenses');
  }

  if (IS_WIN) {
    const r = run('reg', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem', '/v', 'LongPathsEnabled'], { capture: true, allowFail: true });
    /0x1/.test(r.stdout || '') ? log.ok('Windows long paths enabled') : log.warn('Windows long paths NOT enabled – deep Gradle paths can fail. Enable it (docs/01-install-tools.md) or set PLATFORM_BUILD_DIR=C:\\b');
    if (ROOT.length > 40) log.warn(`This folder path is long (${ROOT.length} chars). Move the platform to something like C:\\apkplatform to avoid path-length errors.`);
  }

  console.log('');
  problems ? console.log(col.red(`${problems} problem(s) must be fixed before building.`)) : console.log(col.green('Everything needed is in place. Try: platform build <app>'));
  return problems;
}

module.exports = { findSdk, findJavaHome, javaVersion, toolEnv, adbPath, keytoolPath, doctor };
