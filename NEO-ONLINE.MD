The online functionality serves as a alternative way of running [Neo](https://github.com/hughhowey/neo), self hosted and served via a browser.

It aims to reimplement as little as possible, so it remains up to date as Neo updates..

Guiding priciple:
- Replace as little as possible - only update the interface with the file system.

**Neo-online does not natively (yet) have any kind of login/authentication, so anyone with access to the web app also has access to your novels by default.**

## Running the web version

Install the existing Node dependencies, then start the HTTP server:

```sh
npm install
npm run start:web
```

Open `http://localhost:3000`. The server listens on `0.0.0.0` and uses
`NEO Library` in the repository by default. Set `NEO_LIBRARY_DIR` to keep the
library elsewhere, for example `NEO_LIBRARY_DIR=/srv/neo/NEO-Library`.

The included `Dockerfile` and `.dockerignore` are only for this self-hosted web
server; they do not build, package, or run the Electron desktop application.

The Docker image keeps the same files in a mounted volume:

```sh
docker build -t neo-online .
docker run --rm -p 3000:3000 -v neo-library:/data neo-online
```

## Electron to web boundary

The desktop renderer already talks to the filesystem through `window.neo`,
which is exposed by `preload.js`. The web build deliberately keeps that API so
`app.js` and the Electron build remain unchanged. `web-bridge.js` is loaded by
`index.html`; it does nothing when Electron's preload has already created
`window.neo`, and otherwise maps each call to `POST /api` with a JSON body:

```json
{"op":"writeChapter","args":["book-id","chapter-id","<p>Text</p>"]}
```

`server.js` validates library-relative names and performs the corresponding
filesystem operation. The important replacements are:

| Electron implementation | Web implementation |
| --- | --- |
| `ipcRenderer.invoke('library:read')` in `preload.js` | `window.neo.readLibrary()` -> `POST /api` with `op: "readLibrary"` |
| `window.neo.writeLibrary(data)` | `POST /api` with `op: "writeLibrary"` |
| `window.neo.writeChapter(book, chapter, html)` | `POST /api` with `op: "writeChapter"` |
| `window.neo.readChapter(...)` and all metadata/sidecar methods | Same `POST /api` dispatcher; the operation name identifies the file type |
| `window.neo.readCover(...)` | `POST /api` with `op: "readCover"`; the response remains `{base64, mime, ext}` |
| Electron cover picker and `webUtils.getPathForFile` | Browser file picker plus base64 upload via `op: "writeUploadedCover"`; no client filesystem path is used |
| `window.neo.exportSave(...)` | Text exports download in the browser; DOCX/EPUB `zipEntries` are sent to `op: "exportZip"` and downloaded; PDF is unavailable without Electron's Chromium PDF printer |
| Electron import dialog and `importFiles(paths)` | Browser file picker sends base64 file contents to `op: "importFiles"`; `.txt` and `.md` are supported by the web server |
| Electron menu, updater, secrets, spell worker, and email integration | Browser equivalents: the web menu mirrors the Electron menu, fullscreen uses the Web API, email uses `mailto:`, spellcheck uses the same bundled Hunspell dictionaries through the server, and API-key painting is disabled |

The browser server does not expose arbitrary filesystem paths or arbitrary
URLs. The only disk operations are the named library operations in
`server.js`, and all book/chapter/sidecar names are checked before joining
them to the configured library directory.