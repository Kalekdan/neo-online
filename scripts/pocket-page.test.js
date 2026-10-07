'use strict';

// Pocket has its own copy of the page (pocket/www/index.html). Every element
// app.js looks up by id must be on both pages, or Pocket stops with "Cannot
// set properties of null" where the desktop works (#308).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const ids = (html) => new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
const wanted = new Set([
  ...[...app.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]),
  ...[...app.matchAll(/getElementById\('([\w-]+)'\)/g)].map((m) => m[1])
]);
const made = new Set([
  ...[...app.matchAll(/\.id = '([\w-]+)'/g)].map((m) => m[1]),
  ...ids(app)
]);

for (const page of ['index.html', 'pocket/www/index.html']) {
  test(`every element app.js finds by id is on ${page}`, () => {
    const have = ids(fs.readFileSync(path.join(root, page), 'utf8'));
    assert.deepEqual([...wanted].filter((id) => !have.has(id) && !made.has(id)), []);
  });
}
