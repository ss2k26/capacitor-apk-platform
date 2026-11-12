#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const tls = require('tls');
const net = require('net');
const crypto = require('crypto');
const U = require('./lib/util');
const { log, col, CliError, exists, readJson, writeJson, parseArgs, APPS_DIR, OUTPUT_DIR } = U;
const { listApps, loadApp, printWarnings, APP_ID_RE } = require('./lib/config');
const env = require('./lib/env');
const { createPlaceholderAssets } = require('./lib/placeholder');

const HELP = `
${col.bold('Capacitor APK platform')}

  platform doctor                       check Node / JDK / Android SDK / dependencies
  platform list                         list apps
  platform new <name> --url <URL>       create apps/<name> (options: --id com.x.y  --title "App Name"  --self-signed)
  platform validate <name>              check an app's config and show warnings
  platform pin <name> [--save]          read the server's certificate fingerprint (self-signed SSL)
  platform build <name> [--release] [--aab] [--clean]
                                        build apk (debug by default) -> output/<name>/
  platform prepare <name>               generate the Android project only (open in Android Studio)
  platform keystore <name>              create a release signing key for the app
  platform sha1 <name> [--debug]        print SHA-1/SHA-256 of the signing key (for Google Cloud OAuth)
  platform install <name> [--release]   install latest built apk on a USB-connected phone (adb)
  platform devices                      list adb devices
  platform clean <name|--all>           delete build workspace(s)
`;

function need(pos, what = 'app name') {
  if (!pos[0]) throw new CliError(`Missing ${what}.\n${HELP}`);
  return pos[0];
}

// ---------- new ----------
function cmdNew(pos, flags) {
  const name = U.sanitizeName(need(pos));
  if (!name) throw new CliError('Invalid app name (use letters, digits, dash).');
  const dir = path.join(APPS_DIR, name);
  if (exists(dir)) throw new CliError(`apps/${name} already exists.`);
  const url = flags.url || 'https://192.168.1.10:8443';
  const seg = name.replace(/[^a-z0-9]/g, '');
  let appId = flags.id || `com.example.${/^[a-z]/.test(seg) ? seg : 'app' + seg}`;
  if (!APP_ID_RE.test(appId)) throw new CliError(`Invalid --id "${appId}" (example: com.mycompany.shop).`);
  const title = typeof flags.title === 'string' ? flags.title : name.replace(/(^|-)(\w)/g, (m, a, c) => (a ? ' ' : '') + c.toUpperCase());

  const accent = createPlaceholderAssets(path.join(dir, 'assets'), name);
  const cfg = {
    appId,
    appName: title,
    version: { name: '1.0.0', code: 1 },
    server: { url },
    ssl: { allowSelfSigned: !!flags['self-signed'], pinSha256: [] },
    branding: {
      icon: 'assets/icon.png',
      splash: 'assets/splash.png',
      iconBackgroundColor: accent,
      splashBackgroundColor: accent,
    },
    googleLogin: { enabled: false, webClientId: '' },
  };
  writeJson(path.join(dir, 'app.config.json'), cfg);
  log.ok(`Created apps/${name}/`);
  log.info('app.config.json   <- edit URL, name, colours, permissions ...');
  log.info('assets/icon.png   <- replace with your 1024x1024 icon (placeholder generated)');
  log.info('assets/splash.png <- replace with your 2732x2732 splash (logo centred, ~1200px)');
  if (url.startsWith('https') && !flags['self-signed']) log.info(`Self-signed certificate? Run: platform pin ${name} --save`);
  log.info(`Build: platform build ${name}`);
}

// ---------- validate / list ----------
function cmdValidate(pos) {
  const app = loadApp(need(pos));
  log.ok(`${app.name}: ${app.cfg.appName} (${app.cfg.appId}) -> ${app.cfg.server.url}`);
  printWarnings(app);
  if (!app.warnings.length) log.ok('no warnings');
}

function cmdList() {
  const apps = listApps();
  if (!apps.length) return console.log('No apps yet. Create one: platform new <name> --url https://IP:PORT');
  for (const n of apps) {
    try {
      const { cfg } = loadApp(n);
      console.log(`${col.bold(n.padEnd(20))} ${cfg.appId.padEnd(32)} v${cfg.version.name} (${cfg.version.code})  ${cfg.server.url}${cfg.ssl.allowSelfSigned ? col.yellow('  [self-signed]') : ''}`);
    } catch (e) {
      console.log(`${col.bold(n.padEnd(20))} ${col.red('INVALID')}  ${e.message.split('\n')[0]}`);
    }
  }
}

// ---------- pin ----------
function fetchCert(host, port) {
  return new Promise((resolve, reject) => {
    const opts = { host, port: Number(port), rejectUnauthorized: false, timeout: 8000 };
    if (!net.isIP(host)) opts.servername = host;
    const s = tls.connect(opts, () => {
      const c = s.getPeerCertificate(false);
      const authorized = s.authorized;
      s.end();
      if (!c || !c.raw) return reject(new CliError('Server sent no certificate.'));
      resolve({ cert: c, authorized });
    });
    s.on('timeout', () => { s.destroy(); reject(new CliError(`Timeout connecting to ${host}:${port}`)); });
    s.on('error', (e) => reject(new CliError(`TLS connection to ${host}:${port} failed: ${e.message}`)));
  });
}

async function cmdPin(pos, flags) {
  const app = loadApp(need(pos));
  const { host, port, isHttps } = app.cfg.server;
  if (!isHttps) throw new CliError('server.url is not https – nothing to pin.');
  log.step(`Reading certificate from ${host}:${port}`);
  const { cert, authorized } = await fetchCert(host, port);
  const fp = crypto.createHash('sha256').update(cert.raw).digest('hex');
  const pretty = fp.match(/../g).join(':').toUpperCase();
  log.info(`subject    : ${cert.subject && Object.entries(cert.subject).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  log.info(`issuer     : ${cert.issuer && Object.entries(cert.issuer).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  log.info(`valid      : ${cert.valid_from}  ->  ${cert.valid_to}`);
  log.info(`alt names  : ${cert.subjectaltname || '(none)'}`);
  log.info(`SHA-256    : ${pretty}`);
  log.info(`trusted by a public CA: ${authorized ? 'yes (no pinning needed)' : 'no (self-signed / private CA)'}`);
  if (new Date(cert.valid_to) < new Date()) log.warn('Certificate is EXPIRED.');
  else if (new Date(cert.valid_to) - Date.now() < 30 * 864e5) log.warn('Certificate expires within 30 days – you must rebuild the app after renewing it (pin changes).');
  if (!(cert.subjectaltname || '').includes(host)) log.warn(`Certificate has no SAN entry for ${host}. The app tolerates this, but a browser would not; regenerate it with subjectAltName (GUIDE.md section 6).`);

  if (flags.save) {
    const raw = readJson(app.file);
    raw.ssl = { ...(raw.ssl || {}), allowSelfSigned: true, pinSha256: [pretty] };
    writeJson(app.file, raw);
    log.ok('Saved to app.config.json (ssl.allowSelfSigned=true, ssl.pinSha256=[fingerprint]). Rebuild the app.');
  } else {
    log.info(`Add --save to write this into apps/${app.name}/app.config.json`);
  }
}

// ---------- keystore / sha1 ----------
function cmdKeystore(pos) {
  const app = loadApp(need(pos));
  const propsFile = path.join(app.dir, 'keystore.properties');
  if (exists(propsFile)) throw new CliError(`${propsFile} already exists – refusing to overwrite an existing signing key.`);
  const jks = path.join(app.dir, `${app.name}.jks`);
  if (exists(jks)) throw new CliError(`${jks} already exists.`);
  const pw = crypto.randomBytes(18).toString('base64').replace(/[^A-Za-z0-9]/g, 'x');
  const alias = app.name;
  log.step('Creating release keystore');
  U.run(env.keytoolPath(), ['-genkeypair', '-keystore', jks, '-alias', alias, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-storepass', pw, '-keypass', pw, '-dname', `CN=${app.cfg.appName}, O=${app.cfg.appId}`], { env: env.toolEnv() });
  U.writeText(propsFile, `storeFile=${app.name}.jks\nstorePassword=${pw}\nkeyAlias=${alias}\nkeyPassword=${pw}\n`);
  log.ok(`Created ${jks}`);
  log.ok(`Passwords saved in ${propsFile}`);
  log.warn('BACK UP both files somewhere safe. If you lose the key you cannot ship updates that install over the old app.');
  log.info(`Next: platform sha1 ${app.name}   (register it in Google Cloud if you use Google login)`);
}

function cmdSha1(pos, flags) {
  const app = loadApp(need(pos));
  let store, pass, alias;
  const pf = path.join(app.dir, 'keystore.properties');
  if (!flags.debug && exists(pf)) {
    const p = {};
    for (const l of U.readText(pf).split(/\r?\n/)) { const m = l.match(/^(\w+)=(.*)$/); if (m) p[m[1]] = m[2]; }
    store = path.isAbsolute(p.storeFile) ? p.storeFile : path.join(app.dir, p.storeFile);
    pass = p.storePassword; alias = p.keyAlias;
    log.step('Release key');
  } else {
    store = path.join(os.homedir(), '.android', 'debug.keystore');
    pass = 'android'; alias = 'androiddebugkey';
    if (!exists(store)) throw new CliError('No debug keystore yet – it is created by the first debug build (platform build <app>).');
    log.step('Debug key (used by "platform build" without --release)');
  }
  const r = U.run(env.keytoolPath(), ['-list', '-v', '-keystore', store, '-alias', alias, '-storepass', pass], { capture: true, env: env.toolEnv() });
  for (const l of r.stdout.split(/\r?\n/)) if (/SHA1:|SHA256:/.test(l)) console.log('  ' + l.trim());
  log.info(`Package name: ${app.cfg.appId}`);
}

// ---------- adb ----------
function latestApk(app, release) {
  const dir = path.join(OUTPUT_DIR, app);
  if (!exists(dir)) throw new CliError(`No builds for "${app}" yet. Run: platform build ${app}`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(`-${release ? 'release' : 'debug'}.apk`))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (!files.length) throw new CliError(`No ${release ? 'release' : 'debug'} apk in ${dir}`);
  return path.join(dir, files[0].f);
}

function cmdInstall(pos, flags) {
  const name = need(pos);
  loadApp(name);
  const apk = latestApk(name, !!flags.release);
  log.step(`Installing ${path.basename(apk)}`);
  U.run(env.adbPath(), ['install', '-r', apk], { env: env.toolEnv() });
  log.ok('Installed. Open the app on the phone.');
}

function cmdClean(pos, flags) {
  const names = flags.all ? listApps() : [need(pos)];
  for (const n of names) { U.rmrf(path.join(U.BUILD_DIR, n)); log.ok(`removed build workspace of ${n}`); }
}

// ---------- main ----------
async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = parseArgs(rest);
  switch (cmd) {
    case 'doctor': process.exitCode = env.doctor() ? 1 : 0; break;
    case 'list': cmdList(); break;
    case 'new': cmdNew(pos, flags); break;
    case 'validate': cmdValidate(pos); break;
    case 'pin': await cmdPin(pos, flags); break;
    case 'build': require('./lib/build').build(need(pos), { release: flags.release, aab: flags.aab, clean: flags.clean }); break;
    case 'prepare': require('./lib/build').build(need(pos), { prepareOnly: true, clean: flags.clean }); break;
    case 'keystore': cmdKeystore(pos); break;
    case 'sha1': cmdSha1(pos, flags); break;
    case 'install': cmdInstall(pos, flags); break;
    case 'devices': U.run(env.adbPath(), ['devices', '-l'], { env: env.toolEnv() }); break;
    case 'clean': cmdClean(pos, flags); break;
    default: console.log(HELP);
  }
}

main().catch((e) => {
  if (e instanceof CliError) { log.bad(e.message); process.exitCode = 1; }
  else { console.error(e); process.exitCode = 2; }
});
