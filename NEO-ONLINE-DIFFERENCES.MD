# NEO-online Differences and Maintenance

This file tracks the intentional differences between the Electron desktop version
of NEO and the self-hosted browser version in this repository.

`ONLINE.MD` documents the architecture and HTTP API boundary. This file is the
maintenance checklist: update it when a difference is added, removed, or changed.

## Known Differences

### Runtime and storage

- Electron runs `main.js` and exposes filesystem operations through
  `preload.js`. The browser runs `server.js` and exposes the same logical
  `window.neo` API through `web-bridge.js` and `POST /api`.
- The browser server stores the library in `NEO_LIBRARY_DIR`, which defaults to
  `NEO Library` in the repository. The Electron app uses its own library-folder
  selection and desktop application data locations.
- The browser server has no authentication or authorization. Anyone who can
  reach the server can use the library.
- The browser server validates library-relative book, chapter, sidecar, and
  cover names. It does not expose arbitrary client filesystem paths.

### Menus, window, and keyboard behavior

- The browser renders an HTML menu bar that mirrors the Electron `File`, `Edit`,
  `Format`, `View`, `Window`, and `Help` menus.
- Browser menu actions and browser keyboard accelerators are translated into the
  same renderer menu messages used by Electron.
- Fullscreen uses the browser Fullscreen API. Native window actions such as
  minimize, close, and desktop zoom are unavailable or browser-controlled.
- Browser Escape handling and keyboard shortcuts depend on the page having focus.
  A hard refresh may be needed after updating `web-bridge.js`.

### Import, export, and covers

- Browser manuscript import supports `.txt` and `.md`. Electron also supports
  desktop file paths and the other formats handled by its import flow.
- Browser drag-and-drop uses `File` objects and base64 uploads; it cannot use an
  Electron filesystem path.
- Text, HTML, DOCX, and EPUB exports use browser downloads. PDF export is not
  available because the browser does not provide Electron's Chromium PDF
  printer integration.
- Browser cover selection and drag-and-drop upload image data through the server.
  Browser cover painting with an AI provider is disabled because Electron keeps
  provider secrets in encrypted desktop storage.

### Spellcheck, updates, and integrations

- Browser spellcheck uses the same bundled Hunspell dictionaries through the
  server's Node worker. Dictionary loading, suggestions, learning, and language
  switching are supported.
- Electron's encrypted secret store is not available to the browser. API-key
  cover painting is therefore disabled in the browser.
- Electron's updater can download and install desktop updates. The browser
  deployment has no self-updater; update checks are unavailable.
- Email uses a browser `mailto:` link instead of Electron's native draft flow.
- Browser language reloads reload the page. Electron can reload its application
  window through its main process.

## Maintaining NEO-online

When updating NEO, review the corresponding web surface before considering the
change complete.

### Renderer changes (`app.js`, `index.html`, `styles.css`)

- Keep renderer behavior dependent on the existing `window.neo` contract when
  possible. The same `app.js` is shared by Electron and the browser.
- If a new DOM element, stylesheet rule, font, locale key, or static asset is
  added, verify that `server.js` serves it and that `index.html` loads it in the
  browser.
- If a keyboard shortcut or menu item is added, update the browser menu in
  `app.js` and the browser accelerator mapping in `web-bridge.js`. Check that
  the corresponding `onMenu` message is handled by the renderer.
- If an action depends on a desktop-only capability, add an explicit browser
  fallback and record the difference in this file.

### Electron bridge changes (`preload.js`, `main.js`)

- Treat additions or signature changes in `preload.js` as contract changes.
  Add the matching method to `web-bridge.js`.
- For every new IPC operation in `main.js`, decide whether the browser needs a
  matching `server.js` operation, a browser-native implementation, or a clear
  documented limitation.
- Keep Electron behavior unchanged when the web implementation can remain
  behind the bridge boundary.
- Compare return values and Promise behavior. Browser methods must preserve the
  Electron method's return shape, including Promise results for methods that may
  return synchronously in only one environment.

### Filesystem and data format changes (`main.js`, `server.js`)

- When NEO adds, renames, or changes a library file, update both the Electron
  filesystem handler and the corresponding server operation.
- Review path validation for every new book, chapter, sidecar, cover, import, or
  export path. Do not pass arbitrary browser-provided paths to the filesystem.
- Test a browser round trip for new data: create, read, update, delete, reload,
  and reopen the affected book where applicable.

### Spellcheck and dependencies

- If NEO changes spellcheck behavior, dictionary selection, custom words, or
  normalization, update `spell-worker.js` and the server spell lifecycle as well
  as Electron's worker path.
- If a dictionary or runtime dependency changes, update `package.json`, Docker
  installation behavior, and the spellcheck tests.
- Run `node --test scripts/spellcheck.test.js` after spellcheck changes.

### Verification checklist

- Run `node --check app.js`, `node --check web-bridge.js`, `node --check server.js`,
  and `node --check spell-worker.js`.
- Run `node --test scripts/spellcheck.test.js`.
- Start `npm run start:web`, open the browser version, and hard-refresh it.
- Exercise the changed renderer action through both its menu item and keyboard
  shortcut when one exists.
- Check the browser console and `NEO Library/neo-errors.log` for errors.
- Update `ONLINE.MD` when the HTTP boundary or deployment instructions change.
- Update this file when a known difference or maintenance dependency changes.
