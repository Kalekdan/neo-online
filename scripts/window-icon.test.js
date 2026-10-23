'use strict';

// The window's own icon on Linux (#440): an AppImage has no installed icon
// for the title bar and task bar to fall back on. Loads main.js the way
// filesystem.test.js does, with the window replaced by something that notes
// the options it is made with.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { describe, test } = require('node:test');

const root = path.join(__dirname, '..');
const localRequire = createRequire(path.join(root, 'main.js'));
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

// anything asked of it answers with itself, so a window can be "used" freely
const anything = () => {
  const fn = function () { return proxy; };
  const proxy = new Proxy(fn, { get: (_t, key) => (key === 'then' ? undefined : proxy), apply: () => proxy });
  return proxy;
};

function windowOn(platform) {
  const made = [];
  function BrowserWindow(options) {
    made.push(options);
    return anything();
  }
  BrowserWindow.getFocusedWindow = () => null;
  BrowserWindow.getAllWindows = () => [];
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-window-icon-'));
  const electron = {
    app: { commandLine: { appendSwitch() {} }, getPath: () => userData, getLocale: () => 'en', requestSingleInstanceLock: () => true, whenReady: () => ({ then() {} }), on() {} },
    ipcMain: { on() {}, handle() {} },
    BrowserWindow,
    Menu: { buildFromTemplate: (items) => items, setApplicationMenu() {} },
    nativeTheme: anything(),
    utilityProcess: { fork: () => ({ on() {}, postMessage() {} }) },
    screen: { getAllDisplays: () => [] }
  };
  const context = vm.createContext({
    require: (name) => (name === 'electron' ? electron : localRequire(name)),
    __dirname: root,
    process: { platform, on() {} },
    console,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(source, context, { filename: path.join(root, 'main.js') });
  try {
    vm.runInContext('createWindow()', context);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
  return made[0];
}

describe('the window\'s icon', () => {
  test('on Linux the window is given NEO\'s icon, and the file is there', () => {
    const options = windowOn('linux');
    assert.equal(options.icon, path.join(root, 'build', 'icon.png'));
    assert.ok(fs.statSync(options.icon).size > 0);
  });

  test('the icon is in the packaged app', () => {
    const { build } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.ok(build.files.includes('**/*'));
    assert.ok(!build.files.some((f) => f.startsWith('!') && 'build/icon.png'.startsWith(f.slice(1).replace(/\/?\*+$/, ''))));
  });

  test('the Mac and Windows have their own, and are not given one here', () => {
    for (const platform of ['darwin', 'win32']) assert.equal(windowOn(platform).icon, undefined, platform);
  });
});
