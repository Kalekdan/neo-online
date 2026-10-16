// End-to-end tests for simple NEO and File → Show More Features: a library
// from before the switch, the window in simple NEO, and the switch turned
// both ways. Run with `npm run test:simple`.

'use strict';

const { app, BrowserWindow, Menu } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-simple-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-simple-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);
// a writer from before the switch who uses nothing behind it
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, pageTheme: 'night',
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [] }]
}));
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) {
  return loadFile.call(this, path.resolve(__dirname, '..', file), opts);
};
require('../main.js');

let wc;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
const onDisk = () => JSON.parse(fs.readFileSync(path.join(lib, 'library.json'), 'utf8'));
const clickTab = async (name) => { await js(`document.querySelector('.tab[data-tab="${name}"]').click()`); await tick(300); };
const menuLabels = () => {
  const out = [];
  const walk = (m) => { for (const i of m.items) { if (i.label) out.push(i.label); if (i.submenu) walk(i.submenu); } };
  walk(Menu.getApplicationMenu());
  return out;
};
const key = (opts) => js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, ${JSON.stringify(opts)})))`);
const shot = async (name) => {
  if (!process.env.NEO_SHOTS) return;
  const img = await wc.capturePage();
  fs.writeFileSync(path.join(process.env.NEO_SHOTS, name + '.png'), img.toPNG());
};
const caretInFirst = () => js(`(() => {
  const id = book.chapterOrder.filter((c) => isStory(c))[0];
  const p = document.querySelector('.chapter[data-id="' + id + '"] .chapter-body p');
  p.closest('.chapter-body').focus();
  const r = document.createRange();
  r.setStart(p.firstChild, 3);
  r.collapse(true);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
  currentChapterId = id;
})()`);
const MORE_MENU = ['Vim Keys', 'Focus Mode', 'Language', 'Spellcheck Language', 'Manuscript Format…', 'Import Chapters…', 'Poetry Paragraph'];

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('a library that uses nothing behind the switch is decided simple, on disk', async () => {
  assert.equal(await js('library.moreFeatures'), false);
  assert.equal(onDisk().moreFeatures, false);
});

test('the menu bar is simple, with Show More Features unticked', async () => {
  const labels = menuLabels();
  for (const l of MORE_MENU) assert.ok(!labels.includes(l), l + ' is hidden');
  for (const l of ['Show More Features', 'Typewriter Scrolling', 'Paperback for KDP…', 'Goals…']) assert.ok(labels.includes(l), l + ' is there');
});

test('the Outline is the list, with no cards or loose cards', async () => {
  await clickTab('outline');
  assert.equal(await js(`document.getElementById('outline-list').hidden`), false);
  assert.equal(await js(`document.getElementById('outline-views').hidden`), true);
  assert.equal(await js(`document.getElementById('editor-view').classList.contains('board-on')`), false);
  assert.equal(await js(`document.getElementById('editor-view').classList.contains('outline-tab')`), false);
  await shot('simple-outline');
});

test('Notes holds the book\'s page alone', async () => {
  await clickTab('notes');
  assert.equal(await js('notesPage'), 'book');
  assert.deepEqual(await js(`[...document.querySelectorAll('#notes-nav .notes-item')].map((r) => r.dataset.page)`), ['book']);
});

test('a chapter\'s notes page with notes on it stays in reach', async () => {
  const id = await js(`book.chapterOrder.filter((c) => isStory(c))[1]`);
  await js(`notesPeeks[${JSON.stringify(id)}] = 'Kept from before.'; renderNotesNav()`);
  assert.deepEqual(await js(`[...document.querySelectorAll('#notes-nav .notes-item')].map((r) => r.dataset.page)`), ['book', id]);
  await js(`delete notesPeeks[${JSON.stringify(id)}]; renderNotesNav()`);
});

test('the keys behind the switch do nothing: footnote, poetry, tab keys', async () => {
  await clickTab('manuscript');
  await caretInFirst();
  const before = await js(`document.querySelector('.chapter-body').innerHTML`);
  await key({ key: 'N', code: 'KeyN', metaKey: process.platform === 'darwin', ctrlKey: process.platform !== 'darwin', shiftKey: true });
  await key({ key: 'Enter', code: 'Enter', metaKey: process.platform === 'darwin', ctrlKey: process.platform !== 'darwin', shiftKey: true });
  await tick(100);
  assert.equal(await js(`document.querySelectorAll('.chapter-body .fn, .chapter-body p.poetry').length`), 0);
  assert.equal(await js(`document.querySelector('.chapter-body').innerHTML`), before);
  await key({ key: 'ArrowRight', code: 'ArrowRight', metaKey: process.platform === 'darwin', ctrlKey: process.platform !== 'darwin', altKey: true });
  await tick(200);
  assert.equal(await js('currentTab'), 'manuscript');
});

test('the shortcuts window lists only what\'s showing', async () => {
  const rows = await js(`bookShortcutSections().flatMap((s) => s.rows.map((r) => r[1]))`);
  assert.ok(rows.includes('Insert a placeholder note'));
  for (const gone of ['Italic, bold, the Markdown way', 'Add a footnote', 'Start or continue a poetry paragraph', 'Read aloud from the cursor', 'Cycle focus mode', 'Center paragraph', 'Go to the next tab']) {
    assert.ok(!rows.includes(gone), gone + ' is not listed');
  }
});

test('no cards beside the page', async () => {
  await js(`book.chapterNotes = book.chapterNotes || {}; book.chapterNotes[book.chapterOrder.filter((c) => isStory(c))[0]] = 'A note.'`);
  await caretInFirst();
  await js('sideCardsUpdate(true)');
  assert.equal(await js(`document.getElementById('side-cards').innerHTML`), '');
  await shot('simple-page');
});

test('Markdown asterisks stay asterisks in simple NEO', async () => {
  assert.equal(await js('markdownOff()'), true);
});

// a book's right-click on the shelf: what it offers, then closed again
const bookMenu = async () => {
  await js(`document.getElementById('back-to-shelf').click()`);
  await tick(500);
  await js(`document.querySelector('#shelves .book').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }))`);
  await tick(300);
  await shot('book-menu-' + (await js('moreOn()') ? 'more' : 'simple'));
  const cards = await js(`[...document.querySelectorAll('.modal-backdrop:not([hidden]):not(#firstrun) .fr-choice strong')].map((b) => b.textContent)`);
  const small = await js(`[...document.querySelectorAll('.pop-menu [role="menuitem"], .pop-menu button, .popmenu button')].map((b) => b.textContent.trim())`);
  await js(`(document.querySelector('.modal-backdrop:not(#firstrun) .m-cancel') || document.body).click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await tick(200);
  const id = await js('library.shelves[0].bookIds[0]');
  await js(`openBook(${JSON.stringify(id)})`);
  await tick(400);
  return { cards, small };
};

test('a book\'s right-click is the larger cards, with no cover menu or word goal', async () => {
  const { cards } = await bookMenu();
  assert.deepEqual(cards, ['Export…', 'New cover', 'Remove from bookshelf', 'Move to Trash']);
});

test('a choice made behind the switch waits: vim keys saved on, but off in simple NEO', async () => {
  await js(`library.vimKeys = true; applyLook()`);
  assert.equal(await js('vimEnabled'), false);
});

test('Show More Features brings it all back, and is kept', async () => {
  wc.send('menu', { type: 'moreFeatures', checked: true });
  await tick(400);
  assert.equal(await js('library.moreFeatures'), true);
  assert.equal(onDisk().moreFeatures, true);
  assert.equal(await js('vimEnabled'), true);
  const labels = menuLabels();
  for (const l of MORE_MENU) assert.ok(labels.includes(l), l + ' is back');
  assert.ok(Menu.getApplicationMenu().items.some((m) => m.submenu && m.submenu.items.some((i) => i.label === 'Show More Features' && i.checked)));
  await js('sideCardsUpdate(true)');
  assert.notEqual(await js(`document.getElementById('side-cards').innerHTML`), '');
  await clickTab('outline');
  assert.equal(await js(`document.getElementById('editor-view').classList.contains('board-on')`), true);
  assert.equal(await js(`document.getElementById('editor-view').classList.contains('outline-tab')`), true);
  await shot('more-outline');
  await clickTab('notes');
  assert.equal(await js(`document.querySelectorAll('#notes-nav .notes-item').length`), 4);
});

test('with more features, a book\'s right-click is the small menu, cover menu and all, and no word goal', async () => {
  const { cards, small } = await bookMenu();
  assert.deepEqual(cards, []);
  assert.ok(small.some((l) => l.startsWith('Cover')), 'the cover menu: ' + small.join(' | '));
  assert.ok(small.includes('Duplicate'));
  assert.ok(!small.some((l) => l.startsWith('Set word goal')));
  await clickTab('outline');
});

test('and back to simple, where the Outline is the list again and vim keys rest', async () => {
  await clickTab('outline');
  wc.send('menu', { type: 'moreFeatures', checked: false });
  await tick(400);
  assert.equal(onDisk().moreFeatures, false);
  assert.equal(onDisk().vimKeys, true, 'the choice is still saved');
  assert.equal(await js('vimEnabled'), false);
  assert.equal(await js(`document.getElementById('editor-view').classList.contains('board-on')`), false);
  assert.equal(await js(`document.getElementById('outline-list').hidden`), false);
  assert.ok(menuLabels().includes('Show More Features'));
  assert.ok(!menuLabels().includes('Vim Keys'));
});

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    while (!(await js(`typeof library !== 'undefined' && !!library && typeof library.moreFeatures === 'boolean'`).catch(() => false))) await tick(50);
    await tick(300);
    await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      const paras = (s) => Array.from({ length: 6 }, () => ({ text: s }));
      await addImportedBooks([{ name: 'The Lantern Year', chapters: [
        { title: 'The Thaw', paras: paras('Ines found the lantern in the ice house.') },
        { title: 'Salt Road', paras: paras('The convoy left at dawn.') },
        { title: 'The Weigh Station', paras: paras('The scale was older than the road.') }
      ] }], library.shelves[0]);
      const ids = library.shelves[0].bookIds;
      await openBook(ids[ids.length - 1]);
    })()`);
    await tick(400);
    win.focus();
    for (const t of tests) {
      try {
        await t.fn();
        console.log('ok   ' + t.name);
      } catch (err) {
        failed++;
        console.log('FAIL ' + t.name + '\n     ' + String(err.message).replace(/\n/g, '\n     '));
      }
    }
    console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error(err);
  } finally {
    app.exit(failed ? 1 : 0);
  }
}
main();
