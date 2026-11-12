'use strict';
const fs = require('fs');
const path = require('path');
const {
  ROOT, IS_WIN, OUTPUT_DIR, CliError, log, run, exists, ensureDir, readText, writeText, readJson, writeJson,
  rmrf, hashFiles, col,
} = require('./util');
const { loadApp, printWarnings } = require('./config');
const env = require('./env');
const patch = require('./patch');

function binOf(pkg, name) {
  const dir = path.join(ROOT, 'node_modules', ...pkg.split('/'));
  if (!exists(dir)) throw new CliError(`${pkg} is not installed. Run "npm install" in ${ROOT}.`);
  const j = readJson(path.join(dir, 'package.json'));
  const bin = typeof j.bin === 'string' ? j.bin : j.bin[name] || Object.values(j.bin)[0];
  return path.join(dir, bin);
}

const node = (script, args, cwd, extraEnv) => run(process.execPath, [script, ...args], { cwd, env: { ...env.toolEnv(), ...(extraEnv || {}) } });

function wsPackageJson(app) {
  const root = readJson(path.join(ROOT, 'package.json'));
  const want = ['@capacitor/core', '@capacitor/android', '@capacitor/splash-screen', '@capacitor/status-bar'];
  if (app.cfg.googleLogin.enabled) want.push('@capgo/capacitor-social-login');
  for (const p of app.cfg.extraPlugins || []) want.push(p);
  const deps = {};
  for (const p of want) {
    if (!exists(path.join(ROOT, 'node_modules', ...p.split('/')))) {
      throw new CliError(`Plugin ${p} is not installed. Run: npm install ${p}   (in ${ROOT})`);
    }
    deps[p] = (root.dependencies || {})[p] || '*';
  }
  return { name: `app-${app.name}`, version: '1.0.0', private: true, dependencies: deps };
}

function link(target, linkPath) {
  try {
    if (fs.lstatSync(linkPath)) return;
  } catch { /* missing */ }
  fs.symlinkSync(target, linkPath, 'junction'); // junction = no admin rights needed on Windows
}

function prepareWorkspace(app) {
  const { cfg, ws } = app;
  ensureDir(ws);
  writeJson(path.join(ws, 'package.json'), wsPackageJson(app));
  link(path.join(ROOT, 'node_modules'), path.join(ws, 'node_modules'));

  const accent = cfg.branding.iconBackgroundColor && cfg.branding.iconBackgroundColor !== '#ffffff' ? cfg.branding.iconBackgroundColor : '#3b6ea5';
  const www = path.join(ws, 'www');
  ensureDir(www);
  const fill = (s, m) => patch.fill(s, m);
  writeText(path.join(www, 'index.html'), fill(patch.tpl('index.html'), {
    APP_NAME: cfg.appName.replace(/</g, '&lt;'),
    BG: cfg.branding.splashBackgroundColor,
    URL_JSON: JSON.stringify(cfg.server.url).replace(/</g, '\\u003c'),
  }));
  writeText(path.join(www, 'offline.html'), fill(patch.tpl('offline.html'), { APP_NAME: cfg.appName.replace(/</g, '&lt;'), ACCENT: accent }));
  writeJson(path.join(ws, 'capacitor.config.json'), patch.capacitorConfig(app));
}

function resolveAsset(app, rel) {
  if (!rel) return null;
  const p = path.isAbsolute(rel) ? rel : path.join(app.dir, rel);
  if (!exists(p)) throw new CliError(`Branding file not found: ${p} (set in app.config.json -> branding).`);
  return p;
}

function generateAssets(app, state, freshAndroid) {
  const b = app.cfg.branding;
  const icon = resolveAsset(app, b.icon);
  const splash = resolveAsset(app, b.splash);
  const splashDark = resolveAsset(app, b.splashDark);
  if (!icon || !splash) throw new CliError('branding.icon and branding.splash are required.');
  const sig = hashFiles([icon, splash, splashDark], JSON.stringify([b.iconBackgroundColor, b.iconBackgroundColorDark, b.splashBackgroundColor, b.splashBackgroundColorDark]));
  if (!freshAndroid && state.assetsHash === sig) { log.info('icon/splash unchanged – skipping generation'); return sig; }

  const dir = path.join(app.ws, 'assets');
  rmrf(dir);
  ensureDir(dir);
  fs.copyFileSync(icon, path.join(dir, 'icon.png'));
  fs.copyFileSync(splash, path.join(dir, 'splash.png'));
  if (splashDark) fs.copyFileSync(splashDark, path.join(dir, 'splash-dark.png'));

  const args = ['generate', '--android', '--assetPath', 'assets',
    '--iconBackgroundColor', b.iconBackgroundColor, '--iconBackgroundColorDark', b.iconBackgroundColorDark,
    '--splashBackgroundColor', b.splashBackgroundColor, '--splashBackgroundColorDark', b.splashBackgroundColorDark];
  node(binOf('@capacitor/assets', 'capacitor-assets'), args, app.ws);
  return sig;
}

function keystoreProps(app) {
  const f = path.join(app.dir, 'keystore.properties');
  if (!exists(f)) return null;
  const props = {};
  for (const line of readText(f).split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)$/);
    if (m) props[m[1]] = m[2].trim();
  }
  for (const k of ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']) {
    if (!props[k]) throw new CliError(`${f}: "${k}" missing.`);
  }
  const sf = path.isAbsolute(props.storeFile) ? props.storeFile : path.join(app.dir, props.storeFile);
  if (!exists(sf)) throw new CliError(`Keystore file not found: ${sf}`);
  props.storeFile = sf.replace(/\\/g, '/');
  return Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
}

function build(name, opts = {}) {
  const app = loadApp(name);
  const { cfg } = app;
  const release = !!opts.release || !!opts.aab;
  log.step(`Building ${cfg.appName} (${name}) – ${opts.aab ? 'release AAB' : release ? 'release APK' : 'debug APK'}`);
  printWarnings(app);

  if (!exists(path.join(ROOT, 'node_modules', '@capacitor', 'cli'))) throw new CliError('Dependencies not installed. Run "npm install" in the platform folder first.');
  const sdk = env.findSdk();
  if (!sdk) throw new CliError('Android SDK not found. Run "platform doctor" and see docs/01-install-tools.md');
  if (env.javaVersion(env.findJavaHome()) == null) throw new CliError('Java not found. Run "platform doctor".');

  let ks = null;
  if (release) {
    ks = keystoreProps(app);
    if (!ks) throw new CliError(`No signing key for release builds. Run: platform keystore ${name}`);
  }

  if (opts.clean) { log.info('clean workspace'); rmrf(app.ws); }
  prepareWorkspace(app);

  const stateFile = path.join(app.ws, '.platform-state.json');
  let state = exists(stateFile) ? readJson(stateFile) : {};
  const androidDir = path.join(app.ws, 'android');
  let fresh = false;
  if (exists(androidDir) && state.appId && state.appId !== cfg.appId) {
    log.warn(`appId changed (${state.appId} -> ${cfg.appId}); recreating the Android project`);
    rmrf(androidDir);
  }
  const cap = binOf('@capacitor/cli', 'capacitor');
  if (!exists(androidDir)) {
    log.step('Creating Android project');
    node(cap, ['add', 'android'], app.ws);
    fresh = true;
  }

  log.step('Icon & splash screen');
  state.assetsHash = generateAssets(app, state, fresh);

  log.step('Syncing Capacitor');
  node(cap, ['sync', 'android'], app.ws);

  log.step('Applying app config');
  const manifest = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
  patch.patchManifest(manifest, cfg);
  patch.patchMainActivity(androidDir, cfg, cfg.ssl.pinSha256, app.allowNavigation);
  patch.patchGradle(androidDir, cfg, ks);
  patch.writeLocalProperties(androidDir, sdk);
  state.appId = cfg.appId;
  writeJson(stateFile, state);
  log.ok('manifest, MainActivity, version and signing configured');

  if (opts.prepareOnly) {
    log.ok(`Android project ready: ${androidDir}  (open this folder in Android Studio)`);
    return null;
  }

  log.step('Running Gradle (first build downloads Gradle + dependencies, can take several minutes)');
  const gradle = path.join(androidDir, IS_WIN ? 'gradlew.bat' : 'gradlew');
  if (!IS_WIN) { try { fs.chmodSync(gradle, 0o755); } catch { /* ignore */ } }
  const task = opts.aab ? 'bundleRelease' : release ? 'assembleRelease' : 'assembleDebug';
  run(gradle, [task, '--console=plain'], { cwd: androidDir, env: env.toolEnv() });

  const variant = release ? 'release' : 'debug';
  const ext = opts.aab ? 'aab' : 'apk';
  const outDir = path.join(androidDir, 'app', 'build', 'outputs', opts.aab ? 'bundle' : 'apk', variant);
  const produced = exists(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith('.' + ext)) : [];
  if (!produced.length) throw new CliError(`Gradle finished but no .${ext} found in ${outDir}`);
  const dest = path.join(OUTPUT_DIR, name);
  ensureDir(dest);
  const target = path.join(dest, `${name}-${cfg.version.name}-${cfg.version.code}-${variant}.${ext}`);
  fs.copyFileSync(path.join(outDir, produced[0]), target);
  const mb = (fs.statSync(target).size / 1048576).toFixed(1);
  console.log('');
  log.ok(`${col.bold(target)} (${mb} MB)`);
  return target;
}

module.exports = { build, prepareWorkspace, keystoreProps };
