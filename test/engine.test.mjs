/**
 * @file test/engine.test.mjs
 * @description Headless integration tests for the Fabric canvas engine.
 *
 * These exercise the real engine against a real 2D rasteriser, so they catch
 * the class of bug that unit tests miss: wrong Fabric API names, broken
 * serialisation round-trips, and export paths that only fail at render time.
 *
 * Run: `npm test`
 */

import './setup-dom.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const { createEngine } = await import('../src/renderer/canvas/engine.js');
const { applyFinish, detectPaintMode, getFinish } = await import('../src/renderer/lib/finishes.js');

/* ── tiny test runner ───────────────────────────────────────────────── */

const results = [];
/**
 * @param {string} name
 * @param {() => Promise<void>|void} fn
 */
async function test(name, fn) {
  try {
    await fn();
    results.push([name, null]);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push([name, error]);
    console.log(`  ✗ ${name}\n      ${String(error.message).split('\n')[0]}`);
  }
}

/* ── fixtures ───────────────────────────────────────────────────────── */

const SVG = {
  pentacle: fs.readFileSync(path.resolve('assets/svgs/symbols/pentacle.svg'), 'utf8'),
  triquetra: fs.readFileSync(path.resolve('assets/svgs/symbols/triquetra.svg'), 'utf8'),
  texture: fs.readFileSync(path.resolve('assets/svgs/textures/tex-parchment-aged.svg'), 'utf8'),
  frame: fs.readFileSync(path.resolve('assets/svgs/frames/frame-circle-ornate.svg'), 'utf8'),
};

const ARTBOARD = { width: 1200, height: 1200, background: '#0d0c12' };
const VIEWPORT = { width: 900, height: 900 };

/**
 * Create an engine with an event log.
 * @returns {{engine: any, log: Map<string, any[]>}}
 */
function makeEngine() {
  const el = document.createElement('canvas');
  document.body.appendChild(el);
  /** @type {Map<string, any[]>} */
  const log = new Map([
    ['layers', []],
    ['selection', []],
    ['viewport', []],
  ]);
  const engine = createEngine(el, {
    onLayers: (layers, opts) => log.get('layers').push({ layers, opts }),
    onSelection: (ids) => log.get('selection').push(ids),
    onViewport: (v) => log.get('viewport').push(v),
  });
  engine.setArtboard(ARTBOARD, VIEWPORT);
  return { engine, log };
}

/** Latest emitted layer list. */
const latest = (log) => log.get('layers').at(-1)?.layers ?? [];

/* ── finishes ───────────────────────────────────────────────────────── */

console.log('\nfinishes');

await test('detects stroked vs filled artwork', () => {
  assert.equal(detectPaintMode(SVG.pentacle), 'stroke');
  assert.equal(detectPaintMode('<svg><path d="M0 0" fill="#fff"/></svg>'), 'fill');
});

await test('applyFinish paints strokes and preserves hollowness', () => {
  const out = applyFinish(SVG.pentacle, 'gold');
  assert.match(out, /<linearGradient id="plm-finish-\d+"/);
  assert.match(out, /stroke="url\(#plm-finish-\d+\)"/);
  assert.match(out, /fill="none"/, 'stroke artwork must stay hollow');
  assert.doesNotMatch(out, /stroke="#d4af4f"/, 'original colour must be replaced');
});

await test('applyFinish emits a distinct id per call', () => {
  const a = applyFinish(SVG.pentacle, 'gold');
  const b = applyFinish(SVG.pentacle, 'gold');
  assert.notEqual(a, b, 'gradient ids must not collide across layers');
});

await test('every finish has valid stops', () => {
  for (const id of ['gold', 'copper', 'silver', 'stone', 'ember', 'obsidian', 'flat-black']) {
    const finish = getFinish(id);
    assert.ok(finish.stops.length >= 2, `${id} needs >= 2 stops`);
    for (const [offset, colour] of finish.stops) {
      assert.ok(offset >= 0 && offset <= 1, `${id} stop offset in range`);
      assert.match(colour, /^#[0-9a-f]{3,8}$/i, `${id} stop colour is a hex value`);
    }
  }
});

/* ── layer creation ─────────────────────────────────────────────────── */

console.log('\nlayer creation');

await test('addSymbol registers kind, finish and svg source', async () => {
  const { engine, log } = makeEngine();
  const layer = await engine.addSymbol({ id: 'pentacle', name: 'Pentacle', svg: SVG.pentacle }, 'copper');

  assert.equal(layer.kind, 'symbol');
  assert.equal(layer.finishId, 'copper');
  assert.ok(layer.svg, 'raw svg must be retained for restyling');

  const [emitted] = latest(log);
  assert.equal(emitted.kind, 'symbol', 'emitted metadata must keep the kind');
  assert.equal(emitted.finishId, 'copper', 'emitted metadata must keep the finish');
  assert.ok(emitted.thumb?.startsWith('data:image/svg+xml'));
  engine.destroy();
});

await test('addSymbol can cover the artboard as a background', async () => {
  const { engine, log } = makeEngine();
  const layer = await engine.addSymbol({ id: 'tex', name: 'Parchment', svg: SVG.texture }, 'gold', {
    asBackground: true,
  });
  assert.equal(layer.kind, 'background');
  assert.equal(layer.scale, 'cover');

  const objects = engine.raw.getObjects().filter((o) => !o.plmOverlay);
  assert.equal(objects.length, 1);
  assert.ok(objects[0].scaleX >= ARTBOARD.width / 256 - 0.01, 'background must cover the width');
  assert.deepEqual(latest(log)[0].kind, 'background');
  engine.destroy();
});

await test('addText creates flat and curved variants', async () => {
  const { engine } = makeEngine();
  const flat = await engine.addText({ text: 'MMXXV', curve: 0 });
  const arc = await engine.addText({ text: 'CERNUNNOS', curve: 200 });

  assert.equal(flat.kind, 'text');
  assert.equal(flat.text.curve, 0);
  assert.equal(arc.text.curve, 200);
  assert.equal(engine.raw.getObjects().filter((o) => !o.plmOverlay).length, 2);
  engine.destroy();
});

await test('addShape supports every primitive', () => {
  const { engine } = makeEngine();
  for (const shape of ['rect', 'circle', 'triangle', 'hexagon', 'line']) {
    const layer = engine.addShape(shape, {});
    assert.equal(layer.kind, 'shape', shape);
    assert.equal(layer.shape, shape);
  }
  assert.equal(engine.raw.getObjects().filter((o) => !o.plmOverlay).length, 5);
  engine.destroy();
});

/* ── manipulation ───────────────────────────────────────────────────── */

console.log('\nlayer manipulation');

await test('restyleSymbol swaps the finish and keeps position', async () => {
  const { engine, log } = makeEngine();
  const layer = await engine.addSymbol({ id: 'p', name: 'Pentacle', svg: SVG.pentacle }, 'gold');
  const before = engine.raw.getObjects().find((o) => !o.plmOverlay);
  const { left, top } = before;

  await engine.restyleSymbol(layer.id, 'silver', layer);

  const rebuilt = latest(log).find((l) => l.id === layer.id);
  assert.equal(rebuilt.finishId, 'silver');
  const after = engine.raw.getObjects().find((o) => !o.plmOverlay);
  assert.ok(Math.abs(after.left - left) < 0.01 && Math.abs(after.top - top) < 0.01, 'position preserved');
  engine.destroy();
});

await test('updateTextStyle mutates flat text in place', async () => {
  const { engine } = makeEngine();
  const layer = await engine.addText({ text: 'OLD', curve: 0 });
  const objectBefore = engine.raw.getObjects().find((o) => !o.plmOverlay);

  await engine.updateTextStyle(layer.id, { text: 'NEW', fontSize: 120 }, { ...layer });

  const objectAfter = engine.raw.getObjects().find((o) => !o.plmOverlay);
  assert.equal(objectAfter, objectBefore, 'flat text is updated in place, not rebuilt');
  assert.equal(objectAfter.text, 'NEW');
  assert.equal(objectAfter.fontSize, 120);
  engine.destroy();
});

await test('updateTextStyle rebuilds when switching to an arc', async () => {
  const { engine } = makeEngine();
  const layer = await engine.addText({ text: 'ARC', curve: 0 });
  const before = engine.raw.getObjects().find((o) => !o.plmOverlay);

  await engine.updateTextStyle(layer.id, { curve: 180 }, { ...layer });

  const after = engine.raw.getObjects().find((o) => !o.plmOverlay);
  assert.notEqual(after, before, 'curved text needs a different Fabric object type');
  assert.equal(after.type, 'group');
  engine.destroy();
});

await test('reorder and moveLayerToIndex change stacking', async () => {
  const { engine } = makeEngine();
  const a = await engine.addSymbol({ id: 'a', name: 'A', svg: SVG.pentacle }, 'gold');
  const b = await engine.addSymbol({ id: 'b', name: 'B', svg: SVG.triquetra }, 'gold');

  const design = () => engine.raw.getObjects().filter((o) => !o.plmOverlay);

  engine.reorderLayer(b.id, 'back');
  assert.equal(design()[0].plmName, 'B', 'send to back');

  engine.moveLayerToIndex(b.id, 1);
  assert.equal(design()[1].plmName, 'B', 'move to index');

  engine.reorderLayer(a.id, 'front');
  assert.equal(design()[1].plmName, 'A', 'bring to front');
  engine.destroy();
});

await test('applyLayerProps toggles visibility, opacity and lock', async () => {
  const { engine } = makeEngine();
  const layer = await engine.addSymbol({ id: 'x', name: 'X', svg: SVG.pentacle }, 'gold');

  engine.applyLayerProps(layer.id, { opacity: 0.4, visible: false, locked: true });
  const object = engine.raw.getObjects().find((o) => !o.plmOverlay);
  assert.equal(object.opacity, 0.4);
  assert.equal(object.visible, false);
  assert.equal(object.selectable, false, 'locked layers are not selectable');
  engine.destroy();
});

await test('duplicate, copy/paste and delete keep the stack consistent', async () => {
  const { engine, log } = makeEngine();
  const layer = await engine.addSymbol({ id: 'd', name: 'D', svg: SVG.pentacle }, 'gold');

  await engine.duplicateLayers([layer.id]);
  assert.equal(engine.raw.getObjects().filter((o) => !o.plmOverlay).length, 2);

  engine.deselect();
  engine.selectObjects(engine.raw.getObjects().filter((o) => !o.plmOverlay));
  await engine.copySelection();
  await engine.paste();
  assert.equal(engine.raw.getObjects().filter((o) => !o.plmOverlay).length, 4);

  engine.removeLayers(latest(log).map((l) => l.id));
  assert.equal(engine.raw.getObjects().filter((o) => !o.plmOverlay).length, 0);
  engine.destroy();
});

await test('group and ungroup preserve object count', async () => {
  const { engine, log } = makeEngine();
  const a = await engine.addSymbol({ id: 'a', name: 'A', svg: SVG.pentacle }, 'gold');
  const b = engine.addShape('circle', {});
  engine.selectObjects(engine.objectsForLayers([a.id, b.id]));

  await engine.groupSelection();
  const grouped = latest(log);
  assert.equal(grouped.length, 1, 'two layers collapse into one group');
  assert.equal(grouped[0].kind, 'group');

  engine.selectObjects(engine.objectsForLayers([grouped[0].id]));
  engine.ungroupSelection();
  assert.equal(engine.raw.getObjects().filter((o) => !o.plmOverlay).length, 2, 'children are restored');
  engine.destroy();
});

await test('alignSelection centres an object in the artboard', async () => {
  const { engine } = makeEngine();
  const layer = await engine.addShape('circle', { left: 100, top: 100, size: 200 });
  engine.selectObjects(engine.objectsForLayers([layer.id]));
  engine.alignSelection('center');

  const object = engine.raw.getObjects().find((o) => !o.plmOverlay);
  const bounds = object.getBoundingRect();
  assert.ok(Math.abs(bounds.left + bounds.width / 2 - ARTBOARD.width / 2) < 1, 'horizontally centred');
  assert.ok(Math.abs(bounds.top + bounds.height / 2 - ARTBOARD.height / 2) < 1, 'vertically centred');
  engine.destroy();
});

/* ── viewport ───────────────────────────────────────────────────────── */

console.log('\nviewport');

await test('zoom is clamped and reported', () => {
  const { engine, log } = makeEngine();
  engine.setZoom(99);
  assert.equal(engine.userZoom, 6);
  engine.setZoom(0.0001);
  assert.equal(engine.userZoom, 0.15);
  engine.zoomFit();
  assert.equal(engine.userZoom, 1);
  assert.ok(log.get('viewport').length > 0, 'viewport changes are reported to React');
  engine.destroy();
});

await test('fit scale keeps the artboard inside the viewport', () => {
  const { engine } = makeEngine();
  assert.ok(engine.fitScale > 0 && engine.fitScale <= 1);
  assert.ok(ARTBOARD.width * engine.fitScale <= VIEWPORT.width);
  engine.destroy();
});

await test('grid overlays never enter the design object list', () => {
  const { engine } = makeEngine();
  engine.setGridVisible(true);
  const overlays = engine.raw.getObjects().filter((o) => o.plmOverlay);
  assert.ok(overlays.length > 10, 'grid draws overlay lines');
  engine.setGridVisible(false);
  assert.equal(engine.raw.getObjects().filter((o) => o.plmOverlay).length, 1, 'only the frame remains');
  engine.destroy();
});

/* ── serialisation & export ─────────────────────────────────────────── */

console.log('\nserialisation & export');

await test('toDocument round-trips through loadDocument', async () => {
  const { engine } = makeEngine();
  await engine.addSymbol({ id: 'p', name: 'Pentacle', svg: SVG.pentacle }, 'gold');
  await engine.addText({ text: 'ROUNDTRIP', curve: 120 });
  engine.addShape('hexagon', {});

  const doc = engine.toDocument({ artboard: ARTBOARD, meta: { name: 'Roundtrip' } });
  assert.equal(doc.version, 1);
  assert.equal(doc.layers.length, 3);
  assert.equal(doc.scene.objects.length, 3, 'scene excludes overlays');
  assert.equal(doc.meta.name, 'Roundtrip');

  const { engine: restored } = makeEngine();
  await restored.loadDocument(doc, VIEWPORT);
  assert.equal(restored.raw.getObjects().filter((o) => !o.plmOverlay).length, 3, 'all layers survive');

  const round = restored.toDocument({ artboard: ARTBOARD, meta: {} });
  assert.equal(round.layers.length, 3);
  assert.deepEqual(
    round.layers.map((l) => l.kind).sort(),
    doc.layers.map((l) => l.kind).sort(),
    'layer kinds survive the round trip',
  );
  engine.destroy();
  restored.destroy();
});

await test('exportRaster produces a real PNG at the requested multiple', () => {
  const { engine } = makeEngine();
  engine.addShape('circle', {});

  for (const multiplier of [1, 2, 4]) {
    const dataUrl = engine.exportRaster('png', multiplier);
    assert.match(dataUrl, /^data:image\/png;base64,/, `png @${multiplier}x`);
    const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
    assert.ok(bytes.length > 500, `png @${multiplier}x has content`);
    // PNG IHDR: 8-byte signature then width/height as big-endian uint32.
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.equal(width, ARTBOARD.width * multiplier, `width @${multiplier}x`);
    assert.equal(height, ARTBOARD.height * multiplier, `height @${multiplier}x`);
  }
  engine.destroy();
});

await test('export restores the canvas after rendering', () => {
  const { engine } = makeEngine();
  engine.addShape('circle', {});
  const before = {
    width: engine.raw.getWidth(),
    height: engine.raw.getHeight(),
    zoom: engine.raw.viewportTransform[0],
  };
  engine.exportRaster('png', 3);
  assert.equal(engine.raw.getWidth(), before.width, 'viewport width restored');
  assert.equal(engine.raw.getHeight(), before.height, 'viewport height restored');
  assert.equal(engine.raw.viewportTransform[0], before.zoom, 'zoom restored');
  engine.destroy();
});

await test('exportSvg emits a standalone vector document', () => {
  const { engine } = makeEngine();
  engine.addShape('circle', {});
  const svg = engine.exportSvg();
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /<svg[^>]*>/);
  assert.match(svg, /<\/svg>\s*$/);
  engine.destroy();
});

await test('jpeg export honours the quality path', () => {
  const { engine } = makeEngine();
  engine.addShape('rect', {});
  const dataUrl = engine.exportRaster('jpeg', 1);
  assert.match(dataUrl, /^data:image\/jpeg;base64,/);
  engine.destroy();
});

/* ── summary ────────────────────────────────────────────────────────── */

const failed = results.filter(([, error]) => error);
console.log(`\n${results.length - failed.length}/${results.length} engine tests passed`);
if (failed.length) {
  console.log('\nFailures:');
  for (const [name, error] of failed) console.log(`  • ${name}\n    ${error.stack?.split('\n').slice(0, 4).join('\n    ')}`);
  process.exitCode = 1;
}
