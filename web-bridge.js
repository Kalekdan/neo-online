// Browser replacement for preload.js. Electron's preload creates window.neo
// first, so this file is intentionally a no-op in the desktop app.
if (!window.neo) {
  (() => {
    const call = (op, ...args) => fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, args }) }).then((r) => r.json()).then((r) => { if (!r.ok) throw new Error(r.error); return r.value; });
    const locale = (() => { try { const x = new XMLHttpRequest(); x.open('GET', '/locales/en.json', false); x.send(); return { locale: 'en', dict: {}, base: x.status === 200 ? JSON.parse(x.responseText) : {} }; } catch { return { locale: 'en', dict: {}, base: {} }; } })();
    const chooseFile = (accept) => new Promise((resolve) => { const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.onchange = () => resolve(input.files[0] || null); input.click(); });
    const asBase64 = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
    const upload = (file, bookId) => asBase64(file).then((content) => call('writeUploadedCover', bookId, file.name, content));
    const importFiles = (files) => Promise.all(files.map((file) => asBase64(file).then((content) => ({ name: file.name, content })))).then((files) => call('importFiles', files));
    const download = (name, content, base64) => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([base64 ? Uint8Array.from(atob(content), (c) => c.charCodeAt(0)) : content], { type: 'application/octet-stream' })); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); return name; };
    let menuHandler = null;
    document.addEventListener('keydown', (e) => {
      if (!menuHandler || e.isComposing || !(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      let message = null;
      if (!e.shiftKey && key === 'e') message = { type: 'emailDraft' };
      else if (!e.shiftKey && key === ',') message = { type: 'stats' };
      else if (e.shiftKey && key === 'i') message = { type: 'import' };
      else if (!e.shiftKey && key === 'f') message = { type: 'find' };
      else if (!e.shiftKey && key === '/') message = { type: 'help' };
      else if (e.shiftKey && key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        window.neo.fullscreenToggle().catch((error) => window.neo.logError(`fullscreen: ${error.message}`));
        return;
      }
      else if (e.shiftKey && key === 'o') message = { type: 'focusCycle' };
      else if (e.shiftKey && key === 't') message = { type: 'typewriter' };
      else if (e.shiftKey && key === 'l') message = { type: 'align', value: 'left' };
      else if (e.shiftKey && key === 'c') message = { type: 'align', value: 'center' };
      else if (e.shiftKey && key === 'r') message = { type: 'align', value: 'right' };
      else if (e.shiftKey && key === 'j') message = { type: 'align', value: 'justify' };
      else if (e.code === 'Equal') message = { type: 'fontSize', value: 1 };
      else if (!e.shiftKey && (key === '-' || e.code === 'Minus')) message = { type: 'fontSize', value: -1 };
      else if (!e.shiftKey && key === '0') message = { type: 'fontSize', value: 0 };
      if (!message) return;
      e.preventDefault();
      e.stopPropagation();
      menuHandler(message);
    }, true);
    window.neo = {
      i18n: locale,
      readLibrary: () => call('readLibrary'), writeLibrary: (x) => call('writeLibrary', x), libraryPath: () => call('libraryPath'), createBook: (x) => call('createBook', x), listBooks: () => call('listBooks'), readBookMeta: (x) => call('readBookMeta', x), writeBookMeta: (x, y) => call('writeBookMeta', y), deleteBook: (x) => call('deleteBook', x),
      readChapter: (x, y) => call('readChapter', x, y), chapterStamps: (x) => call('chapterStamps', x), writeChapter: (x, y, z) => call('writeChapter', x, y, z), deleteChapter: (x, y) => call('deleteChapter', x, y), readAux: (x, y) => call('readAux', x, y), writeAux: (x, y, z) => call('writeAux', x, y, z), readJSON: (x, y, z) => call('readJSON', x, y, z), writeJSON: (x, y, z) => call('writeJSON', x, y, z),
      readCover: (x, y) => call('readCover', x, y), removeCover: (x) => call('removeCover', x), pickCover: () => chooseFile('image/png,image/jpeg,image/webp'), setCover: (x, file) => file instanceof File ? upload(file, x) : null,
      hasSecret: () => false, setSecret: () => false, paintCover: () => Promise.reject(new Error('Cover painting is not configured for the browser bridge')),
      exportSave: async ({ format, defaultName, content, zipEntries }) => { if (format === 'pdf') return null; if (zipEntries) return download(`${defaultName}.${format}`, await call('exportZip', zipEntries), true); return download(`${defaultName}.${format}`, content, false); },
      emailDraft: ({ to, subject, body }) => { location.href = `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`; return { ok: true, method: 'mailto' }; }, importPick: () => chooseFile('.txt,.md').then((file) => file ? importFiles([file]) : []), importFiles, pathForFile: () => null,
      fullscreenEscape: () => document.fullscreenElement ? document.exitFullscreen().then(() => true) : Promise.resolve(false), fullscreenToggle: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(), checkForUpdate: () => call('checkForUpdate'), installUpdate: () => false, appVersion: () => call('appVersion'), openRelease: () => true,
      spellCheckWords: (x) => call('spellCheckWords', x), spellSuggest: (x) => call('spellSuggest', x), spellLearn: (x) => call('spellLearn', x), setSpellLanguage: (x) => call('setSpellLanguage', x), logError: (x) => call('logError', x), onMenu: (callback) => { menuHandler = callback; }, reloadForLanguage: () => location.reload(), poetryState: () => {}, typewriterState: () => {}, vimState: () => {}, uiZoomState: () => {}, writingStyleState: () => {}, viewState: () => {}
    };
  })();
}