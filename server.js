// NEO online server
// The browser bridge sends the same logical operations that preload.js sends
// to Electron. This process is the only component allowed to touch the
// library on disk.
'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const LIBRARY_DIR = path.resolve(process.env.NEO_LIBRARY_DIR || path.join(ROOT, 'NEO Library'));
const LIBRARY_FILE = path.join(LIBRARY_DIR, 'library.json');
const SPELL_LANGUAGES = {
  'en-US': 'dictionary-en-us', 'en-GB': 'dictionary-en-gb', 'en-CA': 'dictionary-en-ca', 'en-AU': 'dictionary-en-au',
  fr: 'dictionary-fr', es: 'dictionary-es', de: 'dictionary-de', nl: 'dictionary-nl', pl: 'dictionary-pl',
  'pt-BR': 'dictionary-pt', ro: 'dictionary-ro', ru: 'dictionary-ru'
};
let spellWorker = null;
let spellSequence = 0;
const spellWaiting = new Map();
let spellLanguage = null;
const BOOK_LOCK_TTL = 45000;
const bookLocks = new Map();
function lockBook(bookId, clientId) {
  if (typeof clientId !== 'string' || !clientId) return { locked: false };
  const now = Date.now();
  const current = bookLocks.get(bookId);
  if (current && current.expires > now && current.clientId !== clientId) return { locked: true };
  bookLocks.set(bookId, { clientId, expires: now + BOOK_LOCK_TTL });
  return { locked: false, leaseMs: BOOK_LOCK_TTL };
}
function releaseBook(bookId, clientId) {
  const current = bookLocks.get(bookId);
  if (current && current.clientId === clientId) bookLocks.delete(bookId);
  return true;
}
function touchBookLock(bookId, clientId) {
  const current = bookLocks.get(bookId);
  if (!current || current.expires <= Date.now()) { bookLocks.delete(bookId); return true; }
  if (current.clientId !== clientId) throw new Error('Book is open in another browser instance');
  current.expires = Date.now() + BOOK_LOCK_TTL;
  return true;
}
function startSpellWorker() {
  if (spellWorker) return;
  spellWorker = new Worker(path.join(ROOT, 'spell-worker.js'));
  spellWorker.on('message', (message) => { const done = spellWaiting.get(message.id); if (done) { spellWaiting.delete(message.id); done(message); } });
  spellWorker.on('error', (error) => { for (const done of spellWaiting.values()) done({ ok: false, error: error.message }); spellWaiting.clear(); spellWorker = null; });
  spellWorker.on('exit', () => { for (const done of spellWaiting.values()) done({ ok: false, error: 'spell worker exited' }); spellWaiting.clear(); spellWorker = null; });
}
function spellRequest(message) {
  startSpellWorker();
  return new Promise((resolve) => { const id = ++spellSequence; spellWaiting.set(id, resolve); spellWorker.postMessage({ ...message, id }); });
}
async function loadSpellDictionary(code) {
  const language = SPELL_LANGUAGES[code] ? code : 'en-US';
  const custom = readJSON(LIBRARY_FILE, {}).customWords || [];
  const result = await spellRequest({ type: 'load', language: language === 'pt-BR' ? 'pt-BR' : language, dir: path.join(ROOT, 'node_modules', SPELL_LANGUAGES[language]), custom });
  if (result.ok) spellLanguage = language;
  return result.ok;
}
async function ensureSpellDictionary() {
  if (spellLanguage) return true;
  const saved = readJSON(LIBRARY_FILE, {}).spellLanguage;
  return loadSpellDictionary(SPELL_LANGUAGES[saved] ? saved : 'en-US');
}
async function spellCheck(words) {
  if (!(await ensureSpellDictionary())) return Object.fromEntries((words || []).map((word) => [word, true]));
  const result = await spellRequest({ type: 'check', words });
  return result.ok ? result.result : Object.fromEntries((words || []).map((word) => [word, true]));
}

const DEFAULT_LIBRARY = () => ({ authorName: '', penNames: [], firstRunDone: false, pageTheme: 'night', shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [] }] });
function safeName(value) {
  if (typeof value !== 'string' || !value || value === '.' || value === '..' || /[\\/\0]/.test(value)) throw new Error('Invalid library name');
  return value;
}
function bookDir(id) { return path.join(LIBRARY_DIR, safeName(id)); }
function readJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJSON(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = file + '.tmp'; fs.writeFileSync(temp, JSON.stringify(data, null, 2)); fs.renameSync(temp, file); }
function ensureLibrary() { fs.mkdirSync(LIBRARY_DIR, { recursive: true }); if (!fs.existsSync(LIBRARY_FILE)) writeJSON(LIBRARY_FILE, DEFAULT_LIBRARY()); }
function catalog() {
  try {
    const lib = readJSON(LIBRARY_FILE, { shelves: [] }); const shelf = {};
    for (const s of lib.shelves || []) for (const id of s.bookIds || []) shelf[id] = s.name;
    const lines = fs.readdirSync(LIBRARY_DIR).filter((n) => n.startsWith('book-')).map((n) => { const b = readJSON(path.join(LIBRARY_DIR, n, 'book.json'), null); return b ? `${b.title || 'Untitled'}  —  ${n}  —  shelf: ${shelf[b.id] || '(none — removed from shelves)'}` : null; }).filter(Boolean).sort();
    fs.writeFileSync(path.join(LIBRARY_DIR, '_catalog.txt'), 'NEO LIBRARY CATALOG — which folder is which book\n(regenerated automatically; edits here do nothing)\n\n' + lines.join('\n') + '\n');
  } catch { /* catalog is convenience, never a save failure */ }
}
function listBooks() {
  ensureLibrary();
  return fs.readdirSync(LIBRARY_DIR).filter((n) => n.startsWith('book-')).map((n) => { const b = readJSON(path.join(LIBRARY_DIR, n, 'book.json'), null); return b && b.id ? { id: b.id, title: b.title || 'Untitled', author: b.author || '', modified: b.modified || '', kind: b.kind || '' } : null; }).filter(Boolean);
}
function bookPath(id, file) { return path.join(bookDir(id), file); }
function chapterDiverged(current, expected, next) {
  if (current === expected || current === next) return false;
  const bag = (html) => {
    const words = new Map();
    for (const word of String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').split(/\s+/)) {
      if (word) words.set(word, (words.get(word) || 0) + 1);
    }
    return words;
  };
  const diskWords = bag(current);
  if (!diskWords.size) return false;
  const nextWords = bag(next);
  for (const [word, count] of diskWords) if (count > (nextWords.get(word) || 0)) return true;
  return false;
}
function slug(title) { return String(title || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30); }
function importText(name, raw) {
  const paragraphs = raw.split(/\r?\n\s*\r?\n/).map((text) => text.replace(/\s*\r?\n\s*/g, ' ').trim()).filter(Boolean);
  const chapters = []; let current = { title: '', paras: [] };
  for (const paragraph of paragraphs) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(paragraph) || /^(chapter|prologue|epilogue|part)\b[^.!?]{0,50}$/i.exec(paragraph);
    if (heading) { if (current.paras.length) chapters.push(current); current = { title: (heading[2] || paragraph).replace(/^#{1,6}\s*/, '').trim(), paras: [] }; }
    else current.paras.push({ text: paragraph });
  }
  if (current.paras.length || !chapters.length) chapters.push(current);
  return { name, title: null, author: null, chapters };
}
function cover(bookId, filename) {
  if (!/^(cover|art)-\d+\.(png|jpg|webp)$/.test(filename)) return null;
  try { const ext = path.extname(filename).slice(1); return { base64: fs.readFileSync(bookPath(bookId, filename)).toString('base64'), mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', ext }; } catch { return null; }
}

async function operation(op, args, clientId) {
  ensureLibrary();
  const [a, b, c, d] = args || [];
  switch (op) {
    case 'lockBook': return lockBook(a, clientId);
    case 'releaseBook': return releaseBook(a, clientId);
    case 'touchBookLock': return touchBookLock(a, clientId);
    case 'readLibrary': return readJSON(LIBRARY_FILE, DEFAULT_LIBRARY());
    case 'writeLibrary': writeJSON(LIBRARY_FILE, a); catalog(); return true;
    case 'libraryPath': return LIBRARY_DIR;
    case 'listBooks': return listBooks();
    case 'createBook': {
      const seed = slug(a && a.title); const id = 'book-' + (seed ? seed + '-' : '') + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); const dir = bookDir(id); fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true }); const now = new Date().toISOString();
      const book = { id, title: (a && a.title) || 'Untitled', subtitle: '', series: '', author: (a && a.author) || 'Anonymous', wordGoal: 0, created: now, modified: now, chapterOrder: [], tabNames: { notes: 'Notes', outline: 'Outline' } };
      writeJSON(path.join(dir, 'book.json'), book); fs.writeFileSync(path.join(dir, 'notes.html'), ''); fs.writeFileSync(path.join(dir, 'outline.html'), ''); writeJSON(path.join(dir, 'darlings.json'), []); writeJSON(path.join(dir, 'stickies.json'), []); return book;
    }
    case 'readBookMeta': return readJSON(bookPath(a, 'book.json'), null);
    case 'writeBookMeta': { touchBookLock(a.id, clientId); a.modified = new Date().toISOString(); writeJSON(bookPath(a.id, 'book.json'), a); catalog(); return a.modified; }
    case 'deleteBook': touchBookLock(a, clientId); fs.rmSync(bookDir(a), { recursive: true, force: true }); return true;
    case 'chapterStamps': { const dir = bookPath(a, 'chapters'); const out = {}; if (!fs.existsSync(dir)) return out; for (const f of fs.readdirSync(dir)) if (f.endsWith('.html')) { const s = fs.statSync(path.join(dir, f)); out[f.slice(0, -5)] = s.mtimeMs + ':' + s.size; } return out; }
    case 'readChapter': return readFileOrEmpty(bookPath(a, path.join('chapters', safeName(b) + '.html')));
    case 'writeChapter': {
      touchBookLock(a, clientId);
      const file = bookPath(a, path.join('chapters', safeName(b) + '.html'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (typeof d === 'string') {
        let current = null;
        try { current = fs.readFileSync(file, 'utf8'); } catch { /* missing chapter */ }
        if (current !== null && chapterDiverged(current, d, c)) return { conflict: current };
      }
      fs.writeFileSync(file, c);
      return true;
    }
    case 'deleteChapter': touchBookLock(a, clientId); fs.rmSync(bookPath(a, path.join('chapters', safeName(b) + '.html')), { force: true }); return true;
    case 'readAux': return readFileOrEmpty(bookPath(a, safeName(b) + '.html'));
    case 'writeAux': touchBookLock(a, clientId); fs.writeFileSync(bookPath(a, safeName(b) + '.html'), c); return true;
    case 'readJSON': return readJSON(bookPath(a, safeName(b) + '.json'), c);
    case 'writeJSON': touchBookLock(a, clientId); writeJSON(bookPath(a, safeName(b) + '.json'), c); return true;
    case 'importFiles': return (a || []).map((file) => { try { const ext = String(file.name).toLowerCase().split('.').pop(); if (!['txt', 'md'].includes(ext)) throw new Error('Browser import supports .txt and .md files'); return importText(file.name, Buffer.from(file.content, 'base64').toString('utf8')); } catch (err) { return { name: file.name, error: err.message }; } });
    case 'removeCover': touchBookLock(a, clientId); for (const f of fs.readdirSync(bookDir(a))) if (/^cover-\d+\./.test(f)) fs.rmSync(bookPath(a, f)); return true;
    case 'readCover': return cover(a, b);
    case 'writeUploadedCover': { touchBookLock(a, clientId); const ext = String(b).split('.').pop().toLowerCase(); if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) throw new Error('Unsupported cover image'); const file = 'cover-' + Date.now() + '.' + (ext === 'jpeg' ? 'jpg' : ext); fs.writeFileSync(bookPath(a, file), Buffer.from(c, 'base64')); return file; }
    case 'hasSecret': return false;
    case 'setSecret': return false;
    case 'spellCheckWords': return spellCheck(a || []);
    case 'spellSuggest': { if (!(await ensureSpellDictionary())) return []; const result = await spellRequest({ type: 'suggest', word: a }); return result.ok ? result.result : []; }
    case 'spellLearn': { if (typeof a === 'string' && await ensureSpellDictionary()) await spellRequest({ type: 'add', word: a }); return true; }
    case 'setSpellLanguage': { if (!SPELL_LANGUAGES[a]) return false; return loadSpellDictionary(a); }
    case 'appVersion': return 'NEO online v0.0.1';
    case 'checkForUpdate': return { error: true };
    case 'fullscreenEscape': case 'fullscreenToggle': return false;
    case 'logError': fs.appendFileSync(path.join(LIBRARY_DIR, 'neo-errors.log'), `[${new Date().toISOString()}] [browser] ${String(a)}\n`); return true;
    case 'exportZip': { const JSZip = require('jszip'); const zip = new JSZip(); for (const entry of a || []) zip.file(entry.path, entry.base64 ? Buffer.from(entry.content, 'base64') : entry.content, { compression: entry.store ? 'STORE' : 'DEFLATE' }); return (await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })).toString('base64'); }
    default: throw new Error('Unknown operation: ' + op);
  }
}
function readFileOrEmpty(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }
function send(res, status, value) { const body = JSON.stringify(value); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); }
function staticFile(req, res) {
  const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html'); const file = path.resolve(ROOT, requested);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => { if (err) return send(res, 404, { error: 'Not found' }); const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html'; res.writeHead(200, { 'Content-Type': type }); res.end(data); });
}
const server = require('http').createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') { let raw = ''; req.on('data', (chunk) => { raw += chunk; if (raw.length > 20 * 1024 * 1024) req.destroy(); }); req.on('end', async () => { try { const body = JSON.parse(raw || '{}'); send(res, 200, { ok: true, value: await operation(body.op, body.args, body.clientId) }); } catch (err) { send(res, 400, { ok: false, error: String(err.message || err) }); } }); return; }
  if (req.method === 'GET' && req.url.startsWith('/cover/')) { const [, , id, file] = req.url.split('/'); const data = cover(decodeURIComponent(id), decodeURIComponent(file)); if (!data) return send(res, 404, { error: 'Not found' }); res.writeHead(200, { 'Content-Type': data.mime, 'Cache-Control': 'no-store' }); return res.end(Buffer.from(data.base64, 'base64')); }
  if (req.method === 'GET') return staticFile(req, res); send(res, 405, { error: 'Method not allowed' });
});
ensureLibrary();
server.listen(PORT, '0.0.0.0', () => console.log(`NEO online listening on http://0.0.0.0:${PORT}`));
module.exports = { server, operation, LIBRARY_DIR };