#!/usr/bin/env node
'use strict';

// npm run try            the newest .bundle in Downloads, on a copy of your library
// npm run try -- fresh   the same, on an empty library: NEO as a new writer meets it
//
// Opens the version of NEO in a bundle without bringing it into main or
// sending anything to GitHub. It runs from a folder of its own (Downloads/
// NEO trial), with its own settings and a throwaway copy of the library, so
// the real NEO and the real books are never touched; the two can even run
// side by side. Quit the trial when you're done. Happy with it: npm run bundle.
// Stops with a plain sentence (and changes nothing) when something isn't right.

// room for files iCloud never hands over: each holds a thread (see copy)
process.env.UV_THREADPOOL_SIZE = '64';

const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const stop = (msg) => { console.error('\n✋ ' + msg + '\n'); process.exit(1); };
const say = (msg) => console.log('→ ' + msg);

const args = process.argv.slice(2);
const fresh = args.includes('fresh');
const downloads = path.join(os.homedir(), 'Downloads');

// the bundle: one named on the line, or the newest in Downloads
let file = args.find((a) => a !== 'fresh');
if (!file) {
  const found = fs.existsSync(downloads)
    ? fs.readdirSync(downloads).filter((f) => f.endsWith('.bundle'))
      .map((f) => ({ f: path.join(downloads, f), t: fs.statSync(path.join(downloads, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    : [];
  if (!found.length) stop('There\'s no .bundle file in your Downloads folder. Save the one Claude sent there first.');
  file = found[0].f;
}
if (!fs.existsSync(file)) stop(`Can't find ${file}.`);
say(`Trying ${path.basename(file)}`);

// its changes, fetched beside main (main itself doesn't move)
try { git('bundle', 'verify', file); } catch {
  try { git('fetch', '--quiet', 'origin'); git('bundle', 'verify', file); } catch {
    stop('This bundle doesn\'t fit the NEO you have. It may need a newer NEO first (npm run bundle with the earlier one), or Claude can make a fresh one.');
  }
}
const heads = git('bundle', 'list-heads', file).split('\n').filter(Boolean);
if (!heads.length) stop('This bundle is empty.');
const ref = heads[0].split(/\s+/)[1];
git('fetch', '--quiet', '--force', file, `${ref}:refs/neo-trial/head`);

// a clean trial folder each time; only ever one this script made
const home = path.join(downloads, 'NEO trial');
const marker = path.join(home, '.neo-trial');
// a trial still open holds its settings folder (Electron's SingletonLock,
// a link to "host-pid"); clearing the folder under it would pull the rug
function trialOpen() {
  try {
    const pid = Number(/-(\d+)$/.exec(fs.readlinkSync(path.join(home, 'settings', 'SingletonLock')))[1]);
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return !!err && err.code === 'EPERM';
  }
}
if (fs.existsSync(home)) {
  if (!fs.existsSync(marker)) stop(`There's already a folder called "NEO trial" in Downloads that NEO didn't make. Rename or move it, then try again.`);
  if (trialOpen()) stop('The last trial is still open. Quit it (its window bar says "trial copy"), then try again.');
  say('Clearing out the last trial…');
  try { git('worktree', 'remove', '--force', path.join(home, 'app')); } catch { /* already gone */ }
  fs.rmSync(home, { recursive: true, force: true });
}
try { git('worktree', 'prune'); } catch { /* nothing to prune */ }
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(marker, 'Made by npm run try. Safe to delete.\n');
const appDir = path.join(home, 'app');
git('worktree', 'add', '--detach', appDir, 'refs/neo-trial/head');

// the trial's packages: the same as yours unless the bundle changes them
const lock = (dir) => { try { return fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'); } catch { return ''; } };
if (lock(root) === lock(appDir) && fs.existsSync(path.join(root, 'node_modules'))) {
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(appDir, 'node_modules'), 'junction');
} else {
  say('Installing what this version needs (a minute or two)…');
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund'], { cwd: appDir, stdio: 'inherit', shell: process.platform === 'win32' });
}

// where the real NEO keeps its settings, and so its library
const userData = process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support', 'NEO')
  : process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'NEO')
    : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'NEO');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')); } catch { /* none yet */ }
const realLibrary = settings.libraryDir || path.join(os.homedir(), 'Documents', 'NEO Library');
const library = path.join(home, 'NEO Library');

// a copy of the books, read only from the real library. The backups, past
// exports and sync leftovers stay behind. A file still in iCloud, or one
// iCloud or Syncthing is holding, can keep a read waiting for good: one that
// isn't on this Mac is skipped, and one that hasn't copied in a few seconds
// is given up on.
const LEFT_BEHIND = new Set(['Backups', 'Exports', '_duplicates']);
const leftover = (name) => /\.sync-conflict-|^\.|\.icloud$|\.tmp$/.test(name);
let skipped = 0;
function copyFile(a, b) {
  const st = fs.statSync(a);
  if (st.size > 0 && st.blocks === 0) return Promise.reject(new Error('in iCloud'));
  let timer;
  return Promise.race([
    fs.promises.copyFile(a, b),
    new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('waiting')), 8000); })
  ]).finally(() => clearTimeout(timer));
}
async function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  const jobs = [];
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if ((from === realLibrary && LEFT_BEHIND.has(e.name)) || leftover(e.name)) continue;
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) jobs.push(copy(a, b));
    else if (e.isFile()) jobs.push(copyFile(a, b).catch(() => { skipped++; }));
  }
  await Promise.all(jobs);
}
(async () => {
  if (fresh) {
    say('Starting from an empty library, as a new writer would.');
    fs.mkdirSync(library, { recursive: true });
  } else if (fs.existsSync(path.join(realLibrary, 'library.json'))) {
    say('Copying your library for the trial (your real books aren\'t changed)…');
    await copy(realLibrary, library);
    if (skipped) say(skipped === 1 ? '1 file couldn\'t be copied (still in iCloud?) and was left out of the trial.' : `${skipped} files couldn't be copied (still in iCloud?) and were left out of the trial.`);
  } else {
    say('No library found to copy, so the trial starts empty.');
    fs.mkdirSync(library, { recursive: true });
  }

  // the trial's own settings: yours (language, page color), pointed at the copy
  fs.mkdirSync(path.join(home, 'settings'), { recursive: true });
  fs.writeFileSync(path.join(home, 'settings', 'settings.json'), JSON.stringify({ ...settings, libraryDir: library }, null, 2));

  say('Opening the trial. Its window bar says "(trial copy)". Quit it when you\'re done.');
  const electron = require(path.join(appDir, 'node_modules', 'electron'));
  const child = spawn(electron, ['.'], { cwd: appDir, stdio: 'inherit', env: { ...process.env, NEO_TRY_DIR: home } });
  child.on('exit', () => {
    console.log('\n✅ Trial closed. Your real NEO and books weren\'t touched, and nothing was sent to GitHub.');
    console.log('   Happy with it?  npm run bundle   Want another look?  npm run try\n');
    process.exit(0); // (a read iCloud never answered would keep this waiting)
  });
})();
