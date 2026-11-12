'use strict';
// Idempotent patchers for the generated Capacitor Android project.
const fs = require('fs');
const path = require('path');
const { ROOT, exists, readText, writeText, CliError } = require('./util');

const tpl = (name) => readText(path.join(ROOT, 'templates', name));
const fill = (s, map) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? map[k] : m));
const jstr = (s) => JSON.stringify(String(s));
const jarr = (a) => `new String[] {${a.map(jstr).join(', ')}}`;

/** Set (or add) an attribute on the first <tag ...> element. */
function setAttr(xml, tag, attr, value) {
  const re = new RegExp(`<${tag}\\b[^>]*?>`, 's');
  const m = xml.match(re);
  if (!m) throw new CliError(`AndroidManifest.xml: <${tag}> not found.`);
  let open = m[0];
  const aRe = new RegExp(`\\s${attr.replace(':', '\\:')}="[^"]*"`);
  open = aRe.test(open)
    ? open.replace(aRe, ` ${attr}="${value}"`)
    : open.replace(new RegExp(`<${tag}\\b`), `<${tag} ${attr}="${value}"`);
  return xml.replace(re, open);
}

function removeAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*?>`, 's');
  const m = xml.match(re);
  if (!m) return xml;
  const open = m[0].replace(new RegExp(`\\s${attr.replace(':', '\\:')}="[^"]*"`), '');
  return xml.replace(re, open);
}

function patchManifest(file, cfg) {
  let x = readText(file);
  const a = cfg.android;

  x = setAttr(x, 'application', 'android:usesCleartextTraffic', cfg.server.cleartext ? 'true' : 'false');

  const orient = a.orientation && a.orientation !== 'default' ? a.orientation : null;
  x = orient ? setAttr(x, 'activity', 'android:screenOrientation', orient) : removeAttr(x, 'activity', 'android:screenOrientation');

  const perms = new Set(['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE', ...(a.permissions || [])]);
  const full = (p) => (p.includes('.') ? p : `android.permission.${p}`);
  // remove earlier platform-managed block, then re-add
  x = x.replace(/\s*<!-- platform:permissions -->[\s\S]*?<!-- \/platform:permissions -->/g, '');
  const existing = new Set([...x.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)].map((m) => m[1]));
  const lines = [...perms].map(full).filter((p) => !existing.has(p)).map((p) => `    <uses-permission android:name="${p}" />`);
  if (lines.length) {
    x = x.replace('</manifest>', `    <!-- platform:permissions -->\n${lines.join('\n')}\n    <!-- /platform:permissions -->\n</manifest>`);
  }
  writeText(file, x);
}

function patchMainActivity(androidDir, cfg, pinned, trustedHosts) {
  const javaRoot = path.join(androidDir, 'app', 'src', 'main', 'java');
  const pkgPath = path.join(javaRoot, ...cfg.appId.split('.'));
  // remove stale MainActivity from a previous appId
  if (exists(javaRoot)) {
    const stack = [javaRoot];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.name === 'MainActivity.java' && path.dirname(p) !== pkgPath) fs.rmSync(p);
      }
    }
  }
  const social = cfg.googleLogin.enabled;
  const map = {
    PACKAGE: cfg.appId,
    ALLOW_SELF_SIGNED: String(!!cfg.ssl.allowSelfSigned && cfg.server.isHttps),
    TRUSTED_HOSTS: jarr(trustedHosts),
    PINNED_SHA256: jarr(pinned),
    OFFLINE_PAGE: String(!!cfg.android.offlinePage),
    SECURE_WINDOW: String(!!cfg.android.secureWindow),
    KEEP_SCREEN_ON: String(!!cfg.android.keepScreenOn),
    EXTRA_IMPORTS: social
      ? 'import android.content.Intent;\nimport com.getcapacitor.PluginHandle;\nimport ee.forgr.capacitor.social.login.GoogleProvider;\nimport ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;\nimport ee.forgr.capacitor.social.login.SocialLoginPlugin;'
      : '',
    IMPLEMENTS: social ? ' implements ModifiedMainActivityForSocialLoginPlugin' : '',
    EXTRA_MEMBERS: social
      ? `
    // Required by @capgo/capacitor-social-login (see its Android setup docs).
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle handle = getBridge().getPlugin("SocialLogin");
            if (handle == null) return;
            if (handle.getInstance() instanceof SocialLoginPlugin) {
                ((SocialLoginPlugin) handle.getInstance()).handleGoogleLoginIntent(requestCode, data);
            }
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
`
      : '',
  };
  fs.mkdirSync(pkgPath, { recursive: true });
  writeText(path.join(pkgPath, 'MainActivity.java'), fill(tpl('MainActivity.java.tpl'), map));
}

function patchGradle(androidDir, cfg, ksProps) {
  const appDir = path.join(androidDir, 'app');
  writeText(path.join(appDir, 'platform.gradle'), fill(tpl('platform.gradle.tpl'), {
    VERSION_CODE: String(cfg.version.code),
    VERSION_NAME: String(cfg.version.name).replace(/"/g, ''),
  }));

  const bg = path.join(appDir, 'build.gradle');
  let g = readText(bg);
  if (!g.includes("apply from: 'platform.gradle'")) {
    g = g.replace(/\s*$/, '\n\napply from: \'platform.gradle\'\n');
    writeText(bg, g);
  }

  const vars = path.join(androidDir, 'variables.gradle');
  if (exists(vars)) {
    let v = readText(vars);
    const set = (key, val) => { if (val) v = v.replace(new RegExp(`(${key}\\s*=\\s*)\\d+`), `$1${val}`); };
    set('minSdkVersion', cfg.android.minSdk);
    set('compileSdkVersion', cfg.android.compileSdk);
    set('targetSdkVersion', cfg.android.targetSdk);
    writeText(vars, v);
  }

  const ksOut = path.join(androidDir, 'keystore.properties');
  if (ksProps) writeText(ksOut, ksProps);
  else if (exists(ksOut)) fs.rmSync(ksOut);
}

function writeLocalProperties(androidDir, sdk) {
  if (!sdk) return;
  writeText(path.join(androidDir, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);
}

/** Capacitor config object (written as capacitor.config.json in the workspace). */
function capacitorConfig(app) {
  const { cfg } = app;
  const b = cfg.branding;
  const s = cfg.splash;
  const hosts = app.allowNavigation;
  const out = {
    appId: cfg.appId,
    appName: cfg.appName,
    webDir: 'www',
    server: {
      url: cfg.server.url,
      cleartext: !!cfg.server.cleartext,
      allowNavigation: [...new Set([...hosts, `${cfg.server.host}:${cfg.server.port}`])],
    },
    android: {
      allowMixedContent: !!cfg.android.allowMixedContent,
      webContentsDebuggingEnabled: !!cfg.android.webDebugging,
      backgroundColor: b.splashBackgroundColor,
    },
    plugins: {
      SplashScreen: {
        launchAutoHide: !!s.autoHide,
        launchShowDuration: s.showDurationMs,
        launchFadeOutDuration: s.fadeOutMs,
        backgroundColor: b.splashBackgroundColor,
        androidScaleType: s.scaleType,
        showSpinner: !!s.showSpinner,
      },
    },
  };
  if (cfg.android.userAgentSuffix) out.android.appendUserAgent = cfg.android.userAgentSuffix;
  const sb = cfg.statusBar;
  const status = {};
  if (sb.style) status.style = sb.style;
  if (sb.backgroundColor) status.backgroundColor = sb.backgroundColor;
  if (sb.overlaysWebView !== null && sb.overlaysWebView !== undefined) status.overlaysWebView = !!sb.overlaysWebView;
  if (Object.keys(status).length) out.plugins.StatusBar = status;
  return out;
}

module.exports = { patchManifest, patchMainActivity, patchGradle, writeLocalProperties, capacitorConfig, setAttr, fill, tpl };
