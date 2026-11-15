# Pagan Logo Maker

An offline desktop studio for sigils, seals, runic wordmarks and esoteric brand
marks — built in the spirit of Laughingbird's *Amazing Logo Maker*, but with a
dark, gold-lit archetype all its own.

Everything ships inside the app. No CDN, no font downloads, no telemetry: 106
hand-authored vector assets, a dozen typefaces and a Fabric.js canvas engine
that runs the same on Windows and macOS.

![stack](https://img.shields.io/badge/Electron-React-Fabric.js-d4af4f) ![assets](https://img.shields.io/badge/assets-106%20bundled%20SVGs-d4af4f) ![licence](https://img.shields.io/badge/artwork-CC0-d4af4f)

---

## Quick start

```bash
npm install          # installs deps; Electron's binary download may be skipped in CI
npm run dev          # Vite renderer + Electron shell, hot reload
npm test             # 43 headless tests: canvas engine + React shell
npm run dist:win     # NSIS installer  → release/Pagan Logo Maker-1.0.0-x64-Setup.exe
npm run dist:mac     # DMG            → release/Pagan Logo Maker-1.0.0-arm64.dmg
```

> **Sandboxes without a display:** set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` before
> `npm install`. The renderer still builds and the whole test suite still runs —
> it drives the real engine against a headless 2D rasteriser.

---

## What's inside

```
src/main/            Electron main process
  main.js            window lifecycle, single-instance lock, IPC wiring
  menu.js            native menu bar (File/Edit/View/Export/Help)
  window-state.js    remembers size/position across launches
  store.js           tiny JSON settings store (recents, preferences)
  preload.js         contextBridge → window.desktop
  ipc/files.js       open/save projects, export files, import assets
  ipc/library.js     read bundled SVGs from disk

src/renderer/        React 18 + Tailwind renderer
  App.jsx            studio shell, command router, engine lifecycle
  canvas/engine.js   Fabric.js wrapper — the whole document model
  canvas/text.js     flat and text-on-arc (curved) text
  lib/finishes.js    metallic gradients + sheen (Antique Gold, Copper, …)
  lib/assetLibrary.js  vault manifest, search, thumbnails, import
  lib/applyTemplate.js template replay + vector previews
  lib/exporters.js   PNG/JPEG/SVG up to 4K
  assets/templates.js  6 curated starter designs
  assets/library.json  generated manifest of all 106 assets
  components/        TitleBar, Vault, CanvasStage, LayerPanel, Inspector, …
  store/             zustand document store + undo ring

assets/svgs/         106 generated-by-us SVGs (CC0)
  symbols/  74   runes, pentacles, triquetras, ogham, alchemical glyphs
  frames/   18   circular borders, crest shields, banners, sunwheels
  textures/ 14   parchment, cracked stone, weathered wood, gradients

scripts/
  generate-assets.mjs   procedural SVG authoring (source of truth for the vault)
  generate-icons.mjs    app icon → PNG/ICO/ICNS from a code-drawn sigil
  contact-sheet.mjs     render an asset directory to a PNG for review
```

---

## The studio

**Menu bar.** File / Edit / View / Export / Help, with the shortcuts a desktop
app is expected to have. Every menu item dispatches a command string that
`App.runCommand` handles, so the same actions are reachable from the toolbar,
the keyboard and the code.

**Quick toolbar.** New Project, Save Template, Export (PNG / SVG / JPEG, with a
1×–4× resolution picker up to 4K), Undo/Redo, and an About & License modal.

**The Vault** (left). Three accordion categories — *Pagan & Esoteric Symbols*,
*Frames & Shields*, *Textures & Backgrounds* — plus a search field that matches
names and tags, and an import button for your own SVG/PNG files. Click a tile to
place it, or drag it onto the artboard. Textures dropped on the canvas
cover-fit the artboard and are sent to the back automatically.

**The artboard** (centre). Grid overlay, snap-to-align guides against other
layers and the artboard edges, zoom/pan (wheel to zoom, space-drag to pan), and
full drag/scale/rotate with Fabric handles.

**The Inspector** (right). Layers list with drag-to-reorder, grouping, lock and
visibility toggles, then a property panel that adapts to the selection:

| Selection | Controls |
| --- | --- |
| Symbol / background | material finish, fill, stroke, opacity |
| Text | font family (incl. runic + calligraphic), curved-text slider, letter spacing, drop-shadow depth, alignment |
| Shape | fill, stroke, stroke width, corner radius |
| Artboard | size presets, background colour, background finish, grid spacing |

Fifteen material finishes are available, in three families — metals (Antique
Gold, Burnt Gold, Hammered Copper, Polished Silver, Aged Bronze), stones (Mossy
Stone, Cold Granite, Forge Ember, Obsidian) and flats. Each is a multi-stop
linear gradient plus a diagonal specular sheen, defined declaratively in
`src/renderer/lib/finishes.js` so adding one is a data change, not a code change.

**Templates.** Six curated designs (*Coven Seal*, *Rune Shield*, *Alchemist
Mark*, *Greenwitch*, *Night Market*, *Tree of Being*) each with a live vector
thumbnail, composed from fractional coordinates so they adapt to any artboard.

---

## Typography

Twelve faces are bundled as local packages via `@fontsource` (no network):
Cinzel Decorative, Cormorant Garamond, Uncial Antiqua, IM Fell English,
Metamorphous, Almendra SC, MedievalSharp, Noto Sans Runic — plus system
fallbacks. Runic text composes the Elder Futhark block directly, so you can type
`ᚠᚢᚦᚨᚱᚲ` and it renders.

Curved text is a real arc layout, not a CSS trick: characters are placed on a
circle with per-glyph rotation, so the output stays vector in SVG export.

---

## The engine

`src/renderer/canvas/engine.js` is the single source of truth for the document.
It wraps a Fabric canvas behind a plain, documented API:

```js
const engine = createEngine(canvasEl, { onLayers, onSelection, onViewport });

await engine.addSymbol(asset, 'gold', { left, top, scale });
await engine.addText({ text: 'CERNNUNOS', curve: 180 });
await engine.addSymbol(texture, 'gold', { asBackground: true });

engine.moveLayerToIndex(id, 2);
await engine.groupSelection();
const doc = engine.toDocument({ artboard, meta });   // serialisable
engine.exportRaster('png', 4);                       // 4800×4800
engine.exportSvg();
```

Overlays (artboard frame, grid, guides) live in the same Fabric stack but carry
`plmOverlay`, so they are excluded from serialisation, exports, layer lists and
hit-testing. Everything is JSDoc-typed and dependency-light, which is what makes
the module a good target for Copilot completion.

### Extending it

| To add… | Edit | Notes |
| --- | --- | --- |
| a symbol, frame or texture | `scripts/generate-assets.mjs`, then `node scripts/generate-assets.mjs` | the manifest regenerates itself |
| a material finish | `FINISHES` in `lib/finishes.js` | just stops + sheen |
| a template | `assets/templates.js` | fractional coords, layer recipes |
| a menu action | `src/main/menu.js` + `App.runCommand` | command strings are the contract |
| an export format | `lib/exporters.js` + `ipc/files.js` | both raster and text paths |

---

## Testing

No browser required. The suite pairs jsdom with `@napi-rs/canvas`, patches the
2D context so Fabric can rasterise headlessly, and mounts the *real* component
tree:

```
npm test              all suites (builds the renderer bundle first)
npm run test:engine   24 canvas-engine tests
npm run test:ui       19 React-shell tests
```

The engine suite asserts behaviour, not snapshots: finish application keeps
stroked art hollow, gradient ids never collide, document round-trips preserve
layer kinds, backgrounds cover the artboard, PNG exports report the requested
pixel dimensions straight from the IHDR chunk, and the viewport is restored
after every export.

The UI suite clicks through the vault, edits curved text, applies a copper
finish, walks undo/redo, opens the template gallery, picks *Coven Seal*, exports
PNG and SVG, and fails on any unexpected `console.error` along the way.

---

## Packaging

`electron-builder` produces, from one config in `package.json`:

- **Windows** — NSIS installer (custom directory, desktop + Start Menu
  shortcuts, license page from `build/license.txt`) for x64 and arm64, plus a
  portable x64 build.
- **macOS** — DMG and ZIP for x64 and arm64.
- **Linux** — AppImage and deb, as a bonus.

Icons are generated from code (`scripts/generate-icons.mjs` draws the brand
sigil and emits `.png`, a multi-size `.ico` and a hand-built `.icns`), so a
clean checkout can build a signed installer without any binary art in Git.
`npm run dist` regenerates them automatically before packaging.

Code signing is not configured — add your own certificates via the standard
`CSC_LINK` / `CSC_KEY_PASSWORD` environment variables before shipping.

---

## Licence

Artwork bundled with the app (everything in `assets/svgs`) is **CC0 1.0** — use
it for anything, commercial or otherwise, no attribution needed.

Bundled fonts are **SIL OFL 1.1**.

Artwork *you* create in Pagan Logo Maker is entirely yours.

See [`build/license.txt`](build/license.txt) for the full installer agreement.
