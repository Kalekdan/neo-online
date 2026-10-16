'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// the snapshot rules from app.js (SNAPSHOTS), run on their own
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(app.slice(app.indexOf('const SNAP_KEPT'), app.indexOf('// (the rules above are plain functions: scripts/snapshots.test.js)')), context);
vm.runInContext('this.api = { snapName, parseSnapName, textHash, snapsToThin, snapHolder, wordsGone };', context);
const { snapName, parseSnapName, textHash, snapsToThin, snapHolder, wordsGone } = context.api;
const plain = (v) => JSON.parse(JSON.stringify(v));
const DAY = 86400000;

test('a snapshot\'s name says when, what kind, how much changed and the words', () => {
  const at = Date.UTC(2026, 9, 9, 12, 14, 7);
  const name = snapName(at, 'k', 3, 84210.4, 'x7q2');
  assert.equal(name, '20261009T121407Z-k-3-84210-x7q2');
  assert.deepEqual(plain(parseSnapName(name)), { name, at, kind: 'k', changed: 3, words: 84210 });
  assert.match(name, /^[A-Za-z0-9-]+$/); // main.js's own check
  for (const bad of ['snapshot.json', '..', '20261009T121407Z-k-3-x7q2', '20261009T121407Z-K-3-1-a']) assert.equal(parseSnapName(bad), null, bad);
});

test('the fingerprint tells texts apart', () => {
  assert.equal(textHash('<p>Wren pushed.</p>'), textHash('<p>Wren pushed.</p>'));
  assert.notEqual(textHash('<p>Wren pushed.</p>'), textHash('<p>Wren pulled.</p>'));
  assert.notEqual(textHash(''), textHash(' '));
});

test('NEO\'s own snapshots go after a month; ⌘S ones and the newest stay', () => {
  const now = Date.UTC(2026, 9, 9);
  const s = (daysAgo, kind) => ({ name: kind + daysAgo, at: now - daysAgo * DAY, kind });
  const snaps = [s(90, 'd'), s(60, 'k'), s(45, 'r'), s(29, 'd'), s(1, 'd')];
  assert.deepEqual(plain(snapsToThin(snaps, now)).sort(), ['d90', 'r45']);
  // the newest stays even when it's old
  assert.deepEqual(plain(snapsToThin([s(90, 'd')], now)), []);
});

test('a chapter\'s text at a snapshot is in the newest snapshot holding it', () => {
  const snaps = [
    { name: 'a', files: new Set(['c1.html', 'c2.html', 'snapshot.json']) },
    { name: 'b', files: new Set(['c2.html', 'snapshot.json']) },
    { name: 'c', files: new Set(['snapshot.json']) }
  ];
  assert.equal(snapHolder(snaps, 2, 'c1').name, 'a');
  assert.equal(snapHolder(snaps, 2, 'c2').name, 'b');
  assert.equal(snapHolder(snaps, 0, 'c2').name, 'a');
  assert.equal(snapHolder(snaps, 2, 'c3'), null);
});

test('marked: the words a snapshot has that the chapter no longer does', () => {
  const old = [
    'The hatch would not give.',
    'She counted the rungs on the way down. Forty-one.',
    'Below, someone was singing, not a song she knew.',
    ''
  ];
  const cur = [
    'The hatch would not give.',
    'Below, someone was singing. Not a song she knew.'
  ];
  const gone = plain(wordsGone(old, cur));
  assert.equal(gone[0], null, 'still there word for word');
  assert.equal(gone[1], 'all', 'no twin today: gone whole');
  assert.deepEqual(gone[2], [3, 4], '"singing," and "not" changed');
  assert.equal(gone[3], null, 'an empty line is never marked');
  assert.deepEqual(plain(wordsGone(['a b c'], ['a b c d e'])), [null]);
});
