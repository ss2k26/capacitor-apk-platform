'use strict';
// Small helpers. Node built-ins only, so the CLI works before `npm install`.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const IS_WIN = process.platform === 'win32';
const APPS_DIR = path.join(ROOT, 'apps');
const BUILD_DIR = process.env.PLATFORM_BUILD_DIR
  ? path.resolve(process.env.PLATFORM_BUILD_DIR)
  : path.join(ROOT, 'build');
const OUTPUT_DIR = path.join(ROOT, 'output');

class CliError extends Error {}

const tty = process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\u001b[${code}m${s}\u001b[0m` : String(s));
const col = { red: paint(31), green: paint(32), yellow: paint(33), cyan: paint(36), dim: paint(2), bold: paint(1) };

const log = {
  step: (m) => console.log(`\n${col.cyan('==>')} ${col.bold(m)}`),
  info: (m) => console.log(`    ${m}`),
  ok: (m) => console.log(`${col.green('  ✔')} ${m}`),
  warn: (m) => console.log(`${col.yellow('  !')} ${m}`),
  bad: (m) => console.log(`${col.red('  ✘')} ${m}`),
};

function quote(a) {
  a = String(a);
  return /^[\w@%+=:,./\\-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`;
}

/** Run a program. .cmd/.bat files on Windows are run through the shell. */
function run(cmd, args = [], o = {}) {
  const opts = {
    cwd: o.cwd,
    env: { ...process.env, ...(o.env || {}) },
    encoding: 'utf8',
    stdio: o.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
  };
  let r;
  if (o.shell || (IS_WIN && /\.(cmd|bat)$/i.test(cmd))) {
    r = cp.spawnSync([quote(cmd), ...args.map(quote)].join(' '), { ...opts, shell: true });
  } else {
    r = cp.spawnSync(cmd, args, opts);
  }
  if (!o.allowFail) {
    if (r.error) throw new CliError(`Cannot run "${cmd}": ${r.error.message}`);
    if (r.status !== 0) throw new CliError(`"${cmd} ${args.join(' ')}" failed (exit code ${r.status}).`);
  }
  return r;
}

const exists = (p) => fs.existsSync(p);
const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
const readText = (p) => fs.readFileSync(p, 'utf8');
const writeText = (p, s) => { ensureDir(path.dirname(p)); fs.writeFileSync(p, s); };
const readJson = (p) => {
  try { return JSON.parse(readText(p).replace(/^﻿/, '')); }
  catch (e) { throw new CliError(`Invalid JSON in ${p}: ${e.message}`); }
};
const writeJson = (p, o) => writeText(p, JSON.stringify(o, null, 2) + '\n');
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 });

function deepMerge(base, over) {
  if (Array.isArray(over)) return over.slice();
  if (over && typeof over === 'object') {
    const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
    for (const k of Object.keys(over)) out[k] = deepMerge(out[k], over[k]);
    return out;
  }
  return over === undefined ? base : over;
}

function hashFiles(files, extra = '') {
  const h = crypto.createHash('sha256').update(extra);
  for (const f of files) if (f && exists(f)) h.update(fs.readFileSync(f));
  return h.digest('hex');
}

const sanitizeName = (s) => String(s).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--') && ['url', 'id', 'title', 'alias'].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

module.exports = {
  ROOT, IS_WIN, APPS_DIR, BUILD_DIR, OUTPUT_DIR, CliError, col, log, run, quote,
  exists, ensureDir, readText, writeText, readJson, writeJson, rmrf, deepMerge, hashFiles,
  sanitizeName, parseArgs,
};
