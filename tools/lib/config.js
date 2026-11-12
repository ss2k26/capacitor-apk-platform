'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, APPS_DIR, BUILD_DIR, CliError, exists, readJson, deepMerge, log } = require('./util');

const APP_ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const JAVA_KEYWORDS = new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while']);

function listApps() {
  if (!exists(APPS_DIR)) return [];
  return fs.readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && exists(path.join(APPS_DIR, d.name, 'app.config.json')))
    .map((d) => d.name)
    .sort();
}

function loadApp(name) {
  const dir = path.join(APPS_DIR, name);
  const file = path.join(dir, 'app.config.json');
  if (!exists(file)) {
    const have = listApps();
    throw new CliError(`App "${name}" not found (${file}).${have.length ? ' Available: ' + have.join(', ') : ' Create one with: platform new <name> --url https://IP:PORT'}`);
  }
  const defaults = readJson(path.join(ROOT, 'platform.defaults.json'));
  const raw = readJson(file);
  const cfg = deepMerge(defaults, raw);
  cfg.name = name;

  const errors = [];
  const warnings = [];

  if (!cfg.appId || !APP_ID_RE.test(cfg.appId)) errors.push('appId must look like com.company.app (letters/digits/underscore, dot separated).');
  else if (cfg.appId.split('.').some((s) => JAVA_KEYWORDS.has(s))) errors.push('appId contains a Java keyword segment (e.g. "new", "default"); change it.');
  if (!cfg.appName || !String(cfg.appName).trim()) errors.push('appName is required (the name shown under the launcher icon).');

  let u = null;
  try { u = new URL(cfg.server.url); } catch { /* handled below */ }
  if (!u || !/^https?:$/.test(u.protocol)) errors.push('server.url must be a full URL such as https://192.168.1.10:8443');

  if (!Number.isInteger(cfg.version.code) || cfg.version.code < 1) errors.push('version.code must be an integer >= 1.');
  if (!cfg.version.name) errors.push('version.name is required.');

  if (errors.length) throw new CliError(`Invalid ${file}:\n  - ${errors.join('\n  - ')}`);

  const isHttps = u.protocol === 'https:';
  cfg.server.host = u.hostname;
  cfg.server.port = u.port || (isHttps ? '443' : '80');
  cfg.server.isHttps = isHttps;
  if (!isHttps) {
    cfg.server.cleartext = true;
    warnings.push('server.url is http:// – cleartext traffic will be enabled. Use https for anything but a LAN test.');
  }
  if (isHttps && !cfg.ssl.allowSelfSigned) {
    warnings.push('https URL with ssl.allowSelfSigned=false: a self-signed certificate will be REJECTED by the app. Run "platform pin ' + name + '" if your server uses one.');
  }
  if (cfg.ssl.allowSelfSigned && !isHttps) warnings.push('ssl.allowSelfSigned has no effect on an http:// URL.');
  if (cfg.ssl.allowSelfSigned && !(cfg.ssl.pinSha256 || []).length) {
    warnings.push('Self-signed allowed WITHOUT a pinned fingerprint: any certificate for this host is accepted. Run "platform pin ' + name + '" to lock it down.');
  }
  cfg.ssl.pinSha256 = (cfg.ssl.pinSha256 || []).map((p) => String(p).replace(/[^0-9a-fA-F]/g, '').toLowerCase());
  if (cfg.ssl.pinSha256.some((p) => p.length !== 64)) throw new CliError('ssl.pinSha256 entries must be SHA-256 fingerprints (64 hex chars, colons allowed).');

  if (cfg.googleLogin.enabled && !cfg.googleLogin.webClientId) warnings.push('googleLogin.enabled is true but googleLogin.webClientId is empty (only informational; the Laravel page passes it to the plugin).');

  const nav = new Set([cfg.server.host, ...(cfg.server.allowNavigation || [])]);

  return {
    name,
    dir,
    file,
    raw,
    cfg,
    warnings,
    allowNavigation: [...nav],
    ws: path.join(BUILD_DIR, name),
  };
}

function printWarnings(app) {
  for (const w of app.warnings) log.warn(w);
}

module.exports = { listApps, loadApp, printWarnings, APP_ID_RE };
