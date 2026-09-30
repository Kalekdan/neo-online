# NEO online

**A maintained, self-hosted browser fork of NEO for authors.**

> All credit for the NEO goes to the original creator, Hugh Howey. This is simply a fork for my usecase which I hope some others may get some value from.

NEO-online is based on [NEO](https://github.com/hughhowey/neo), a distraction-free word processor for authors. It keeps NEO's renderer and writing experience, while replacing Electron's local filesystem boundary with a Node.js HTTP server so NEO can run in a browser.

This repository is a maintained fork. Upstream NEO changes are merged regularly, and browser-specific differences are kept as small and explicit as possible.

## Run the browser version

Requires [Node.js](https://nodejs.org).

```sh
git clone https://github.com/Kalekdan/neo-online.git
cd neo-online
npm install
npm run start:web
```

Open `http://localhost:3000`. The server listens on `0.0.0.0` and stores the
library in `NEO Library` by default. Set `NEO_LIBRARY_DIR` to use another
location.

Docker is also supported:

```sh
docker build -t neo-online .
docker run --rm -p 3000:3000 -v neo-library:/data neo-online
```

The Docker files build the browser server only; they do not package the
Electron desktop application.

## Upstream NEO

NEO-online preserves the existing Electron implementation and shared renderer
for compatibility with upstream NEO. The desktop app can still be run from
source with `npm start`, and its installers can be built with the existing
Electron Builder commands.

Changes to `app.js`, `preload.js`, `main.js`, library file formats, menus,
shortcuts, spellcheck, or dependencies may require corresponding updates to
`web-bridge.js` and `server.js`. Keep the browser boundary in mind when
bringing changes across from upstream.

## Browser differences

The browser version uses the same renderer and `window.neo` contract as the
Electron app. The server owns filesystem access and validates all library
paths. Browser imports currently support `.txt` and `.md`; browser downloads
support text, HTML, DOCX, and EPUB exports. PDF printing, encrypted desktop
secrets, AI cover painting, native window controls, and desktop auto-updates
remain Electron-only. The browser deployment also has no authentication, so
it should only be exposed to trusted users or behind an appropriate proxy.

## Maintaining the fork

When upstream changes `app.js`, `preload.js`, `main.js`, menus, shortcuts,
library file formats, spellcheck, or dependencies, review `web-bridge.js`,
`server.js`, `spell-worker.js`, and the browser menu for corresponding changes.
Run the syntax checks and `node --test scripts/*.test.js` before merging an
upstream update.

## Why NEO?

**The bookshelf** 

Your library looks like a bookshelf, not a file list. Labeled shelves you organize however you like — by series, by status, by pen name. Progress bars on the covers show how far you are from your word goals. You can drag-and-drop books anywhere. You can also drag shelves around and put cover art on your titles.

**Just a blank page** 

There's a white page by default or a dark mode (which I now prefer!). Controls fade until you mouse over them. Chapters number and renumber themselves automatically. Drop caps mark chapter openings, because I'm a sucker for drop-caps. Em dashes, true ellipses, and curly quotes sort themselves out as you type. Spellcheck exists only when you invoke it — no more red squiggles mid-sentence triggering your imposter syndrome.

**Enter, Enter, Enter** 

One Enter: new paragraph. Two: a `***` section break. Three: a new chapter. The goal is to KEEP WRITING.

Right-click the first chapter's heading to make it a prologue, or the last one's to make it an epilogue: they step out of the numbering, and everything renumbers.

**Darlings** 

The writing advice is "kill your darlings" — but I say: *keep the bodies*. Drag any beautiful-but-in-the-way passage onto the Darlings tab. It leaves your manuscript but isn't lost. Darlings restore to the exact spot it came from. More like zombies than darlings.

**Placeholders** 

Mid-flow and need a name, a fact, a date? ⌘⇧X drops a mark and a sticky note. The left panel shows a red dot on every chapter that you need to get back to. The right panel will list all these to-do items.

**Outlining for plotters** 

Outline chapters and sections in the Outline tab; section notes appear in the manuscript as gray ghost paragraphs, ready to be overwritten. Pantsers can ignore all of it or learn to draw a freakin' map for the first time. Try it. You might like it!

**Cover Art** 

Every book gets a cover! New books are dressed in a seeded abstract (six art styles, six type templates, typefaces bundled with NEO) so no two stories on the shelf look alike. Once a story passes 1,000 words, NEO can read it and paint an abstract cover from the text. This is a bit more work but totally worth it. Get an OpenAI API key from their website and paste it into **File → Cover Art…**. The art is generated in the background for about a penny a picture. (These are not meant for publication, just writing inspiration!) The API key is stored encrypted in NEO's own settings, never in your library folder. The title and author are always set in real type on top, so the lettering is never left to a gen-AI model. The ↻ on any book re-rolls its type and colors, or paints it again. And you can always switch back and forth from the seeded modern look to the painted variety.

**Goals and momentum** 

Daily word goals, word sprints, and a NaNoWriMo-style progress chart. Needs more testing, but I think it works okay!

**A shelf can become one book** 

Right-click a shelf's name and choose **Bind into one book** for an omnibus, a trilogy, or a story collection. Hover over the bound shelf and the pages a published book carries show up faintly in their places: copyright, dedication, epigraph, prologue, epilogue, acknowledgments, about the author. A small + before each title starts a Part. Click a page and type it the way it will print; a prologue or epilogue opens in the editor like any story. The export is one EPUB, Word file, or PDF with a single cover and one table of contents, and chapters can number straight through the whole book. Unbind any time. Nothing is lost.

**Exports** 

EPUB 3 with a proper table of contents built to KDP's guidelines, Word .docx, PDF with page numbers and bookmarks, HTML, markdown, and plain text. Email a timestamped PDF snapshot to yourself with a SHA-256 fingerprint of the text in the body. Might come in handy someday.

**Import** 

Bring in existing .docx, .txt, and .md manuscripts; chapters and scene breaks are detected automatically. This is still a bit rough and might require you to tweak things. It will try to grab your title and remove that from the body, and it seems to be working okay.

**Backups** 

Continuous autosave, daily zip backups kept for two weeks, everything stored as plain files. Set up your NEO library folder on your iCloud if you want for extra safety. You can also email copies of your WIP to yourself with a keystroke: ⌘E.

## Your files

Everything lives in `~/Documents/NEO Library` — one folder per book, chapters as readable HTML, metadata as JSON. Open them in your favorite text editor.

## Languages

NEO speaks English, French, Spanish, Portuguese, German, Italian, Dutch, Polish, Romanian and Russian. Pick one under **View → Language**; on first launch NEO follows your system language when it has it. Adding a language is a single file, no programming needed: see [TRANSLATING.md](TRANSLATING.md).

## Running the Electron compatibility build

Requires [Node.js](https://nodejs.org).

```
git clone https://github.com/Kalekdan/neo-online.git
cd neo-online
npm install
npm start
```

**View → Keyboard Shortcuts…** opens the shortcut reference. You can also press `Cmd+/` on macOS or `Ctrl+/` on Windows and Linux, or use **Help → NEO Shortcuts**.

To build installers: `npm install electron-builder --save-dev`, then `npm run package` (macOS), `npm run package:win` (Windows), or `npm run package:all`. Output lands in `dist/`.

The app is very simple: an Electron shell (`main.js`), a preload bridge (`preload.js`), and a renderer (`app.js` + `styles.css` + `index.html`). If you know JavaScript, you can change NEO. Have at it.

## Roadmap (things I'm dreaming up but may never get to):

Chapter version history · manuscript format for agent submissions (Times New Roman, double-spaced, address block, just to make Kristin Nelson happy) · global end matter that updates every book at once (same for copyright pages, bios, etc).

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Fair warning: NEO is opinionated by design, and bloat killed every writing app I've ever tried. If you want complex, try Scrivener. It really is a great application beloved by many! There are so many wonderful writing apps out there! Nobody needs to use this but me.

## License

[MIT](LICENSE) — free to use, free to modify, free to share.

## Philosophy

If you didn't know, I opened up the Silo universe to fan fiction years ago. And not just to put on fan fiction sites, but you can charge money for the things you write and keep every penny of the income! Lots of incredible Silo Stories out there. But readers are forever looking for more.
