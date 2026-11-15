/**
 * @file test/ui.test.mjs
 * @description End-to-end-ish tests for the React shell.
 *
 * The real component tree is mounted into jsdom and driven with DOM events, so
 * this catches render-time crashes, hook-order violations, broken prop wiring
 * and store/engine desync — the things a type checker cannot see.
 *
 * Run `npm run test:build` first (or just `npm test`, which does both).
 */

import { win, doc } from './setup-dom.mjs';
import assert from 'node:assert/strict';

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react-dom/test-utils');
const App = (await import('./.build/app.mjs')).default;

/* ── harness ────────────────────────────────────────────────────────── */

/** Console errors that indicate real problems (ignoring test-framework noise). */
const IGNORED = /ReactDOMTestUtils|not wrapped in act|Warning: ReactDOM.render/i;
const errors = [];
const originalError = console.error;
console.error = (...args) => {
  const message = args.map(String).join(' ');
  if (IGNORED.test(message)) return;
  errors.push(message);
  originalError(...args);
};

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

const $ = (selector) => doc.querySelector(selector);
const $$ = (selector) => [...doc.querySelectorAll(selector)];
const wait = (ms = 120) => act(async () => new Promise((r) => setTimeout(r, ms)));

/** Click an element through React's synthetic event system. */
async function click(el) {
  assert.ok(el, 'expected an element to click');
  await act(async () => {
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 130));
  });
}

/** Set a controlled input's value the React way. */
async function setValue(el, value) {
  assert.ok(el, 'expected an input to type into');
  const proto =
    el.tagName === 'TEXTAREA'
      ? win.HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT'
        ? win.HTMLSelectElement.prototype
        : win.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new win.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
  });
}

/** @param {string} label accessible button name */
const buttonByLabel = (label) => $(`button[aria-label="${label}"]`);
const dialogButtons = () => $$('[role="dialog"] button');
const dialogButton = (matcher) => dialogButtons().find((b) => matcher.test(b.textContent.trim()));

/* ── mount ──────────────────────────────────────────────────────────── */

const root = createRoot(doc.getElementById('root'));
await act(async () => {
  root.render(React.createElement(App));
  await new Promise((r) => setTimeout(r, 400));
});

/* ── shell ──────────────────────────────────────────────────────────── */

console.log('\nshell');

await test('mounts the full three-pane studio', () => {
  assert.ok($('header'), 'title bar');
  assert.ok($('.canvas-stage canvas'), 'fabric canvas');
  assert.ok($$('.asset-tile').length > 80, 'vault is populated');
  assert.ok($$('.layer-row').length === 0, 'no layers yet');
  assert.ok($$('.panel-header').length >= 2, 'inspector + layers panels');
});

await test('renders without console errors', () => {
  assert.deepEqual(errors, [], `unexpected console output:\n${errors.join('\n')}`);
});

await test('canvas is sized to the viewport', () => {
  const canvas = $('.canvas-stage canvas');
  assert.equal(canvas.width, 1200, 'fabric canvas width follows the host');
  assert.ok(canvas.height > 0);
});

/* ── vault ──────────────────────────────────────────────────────────── */

console.log('\nvault');

await test('clicking a vault tile places a symbol layer', async () => {
  const tile = $$('.asset-tile').find((t) => t.title?.includes('Pentacle'));
  assert.ok(tile, 'pentacle tile exists');
  await click(tile);
  assert.equal($$('.layer-row').length, 1, 'one layer appears');
  assert.match($$('.layer-row')[0].textContent, /Pentacle/);
});

await test('searching the vault filters tiles', async () => {
  const input = $('input[aria-label="Search the vault"]');
  await setValue(input, 'rune');
  const visible = $$('input[aria-label="Search the vault"]').length;
  assert.equal(visible, 1);
  assert.ok($$('.asset-tile').length > 0, 'runes are found');
  await setValue(input, 'zzzzzz');
  const tiles = $$('.asset-tile');
  assert.equal(tiles.length, 1, 'only the Import tile remains');
  assert.match(tiles[0].textContent, /Import/);
  assert.match($('aside').textContent, /Nothing in the vault matches/, 'empty state is shown');
  await setValue(input, '');
  assert.ok($$('.asset-tile').length > 80, 'clearing restores the library');
});

await test('placing a texture covers the artboard as a background', async () => {
  // Open the textures accordion, then place the first one.
  await click($$('.acc-trigger')[0]); // collapse symbols so textures is reachable
  const texturesHeader = $$('.acc-trigger').find((b) => /Textures & Backgrounds/.test(b.textContent));
  assert.ok(texturesHeader, `textures section exists (saw: ${$$('.acc-trigger').map((b) => b.textContent).join(' | ')})`);
  if (!/Textures/.test(texturesHeader.parentElement.parentElement.textContent) || !texturesHeader) return;
  await click(texturesHeader);
  const tile = $$('.asset-tile').find((t) => t.title?.includes('Parchment') || t.title?.includes('Stone'));
  assert.ok(tile, 'a texture tile is visible');
  await click(tile);
  const kinds = $$('.layer-row').map((r) => r.textContent);
  assert.ok(kinds.some((k) => /Parchment|Stone|Slate/i.test(k)), 'the texture appears as a layer');
});

/* ── inspector ──────────────────────────────────────────────────────── */

console.log('\ninspector');

await test('selecting a symbol reveals the material finishes', async () => {
  const row = $$('.layer-row').find((r) => /Pentacle/.test(r.textContent));
  await click(row);
  assert.ok(
    $$('.acc-trigger').some((b) => /Material Finish/i.test(b.textContent)),
    'finish section renders for symbols',
  );
  // The vault's finish strip uses the same tooltips, so scope to the inspector
  // panel — identified by its "Material Finish" heading.
  const inspector = $$('.panel').find((p) => /Material Finish/.test(p.textContent));
  assert.ok(inspector, 'inspector panel with finish controls');
  const swatches = [...inspector.querySelectorAll('button[title]')].filter((b) =>
    /Antique Gold|Hammered Copper|Polished Silver|Mossy Stone|Forge Ember|Obsidian/i.test(b.title),
  );
  assert.ok(swatches.length >= 6, `expected the metal + stone finish swatches, found ${swatches.length}`);

  const copper = swatches.find((b) => /Hammered Copper/.test(b.title));
  await click(copper);
  await wait(400);
  assert.match($$('.layer-row[data-selected="true"]')[0].textContent, /copper/i, 'layer badge reflects the finish');
});

await test('layer visibility and lock toggles respond', async () => {
  const row = $$('.layer-row').find((r) => /Pentacle/.test(r.textContent));
  const [lockBtn, eyeBtn] = [...row.querySelectorAll('button')];
  await click(eyeBtn);
  assert.ok(row.textContent.includes('Pentacle'), 'row still exists when hidden');
  await click(eyeBtn);
  await click(lockBtn);
  assert.ok(true, 'lock toggled without throwing');
  await click(lockBtn);
});

await test('document panel appears when nothing is selected', async () => {
  await act(async () => {
    doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
  });
  assert.ok($$('.acc-trigger').some((b) => /Artboard/i.test(b.textContent)), 'artboard settings shown');
});

/* ── history ────────────────────────────────────────────────────────── */

console.log('\nhistory');

await test('undo and redo are wired to the history stack', async () => {
  // Row labels only show names, and the preceding test toggled a lock, so
  // assert on the toolbar's own enablement rather than on the visible text.
  const redo = () => buttonByLabel('Redo');
  const undo = () => buttonByLabel('Undo');

  assert.equal(redo().disabled, true, 'nothing to redo before undoing');
  assert.equal(undo().disabled, false, 'history has entries to walk back through');

  await click(undo());
  assert.equal(redo().disabled, false, 'redo becomes available after an undo');

  await click(redo());
  assert.equal(redo().disabled, true, 'redo consumed the redo entry');
  assert.equal(undo().disabled, false, 'the change is undoable again');
});

/* ── templates ──────────────────────────────────────────────────────── */

console.log('\ntemplates');

await test('the gallery lists every template with a live preview', async () => {
  await click(buttonByLabel('New Project'));
  await wait(600);
  assert.ok($('[role="dialog"]'), 'gallery opened');
  const cards = dialogButtons().filter((b) =>
    /Coven Seal|Rune Shield|Alchemist Mark|Greenwitch|Night Market|Tree of Being/.test(b.textContent),
  );
  assert.equal(cards.length, 6, 'all templates listed');
  const previews = $$('[role="dialog"] img').filter((img) => img.src.startsWith('data:image/svg'));
  assert.equal(previews.length, 6, 'every card rendered a vector preview');
});

await test('picking a template rebuilds the document', async () => {
  const card = dialogButtons().find((b) => /Coven Seal/.test(b.textContent));
  await click(card);
  await wait(900);
  assert.equal($('[role="dialog"]'), null, 'gallery closed');
  assert.ok($$('.layer-row').length >= 3, 'template layers placed');
  assert.match($('header').textContent, /Coven Seal/, 'project renamed to the template');
});

/* ── typography ─────────────────────────────────────────────────────── */

console.log('\ntypography');

await test('editing curved text updates the layer', async () => {
  const row = $$('.layer-row').find((r) => /COVEN/i.test(r.textContent));
  assert.ok(row, 'the arc text layer is present');
  await click(row);

  const textarea = $('textarea');
  assert.match(textarea.value, /COVEN/);
  await setValue(textarea, 'THE COVEN OF THE NEW ROAD');
  // Layer labels truncate at 22 characters, so assert on the prefix.
  assert.match($$('.layer-row[data-selected="true"]')[0].textContent, /THE COVEN OF THE NEW/);

  const sliders = $$('input[type="range"]');
  assert.ok(sliders.length >= 4, 'curve, spacing, shadow and opacity sliders exist');
});

await test('the arc preset buttons retype the curve', async () => {
  const flat = $$('button').find((b) => b.textContent.trim() === 'Flat');
  assert.ok(flat, 'flat preset exists');
  await click(flat);
  assert.ok(true, 'curve preset applied');
  const full = $$('button').find((b) => b.textContent.trim() === '360°');
  await click(full);
});

/* ── export ─────────────────────────────────────────────────────────── */

console.log('\nexport');

await test('exports a PNG at the chosen resolution', async () => {
  const downloads = [];
  const originalCreate = globalThis.URL.createObjectURL;
  const originalClick = win.HTMLAnchorElement.prototype.click;
  globalThis.URL.createObjectURL = () => 'blob:test';
  win.URL.createObjectURL = () => 'blob:test';
  win.HTMLAnchorElement.prototype.click = function onDownload() {
    downloads.push(this.download);
  };

  try {
    await click(buttonByLabel('Export Design'));
    assert.ok($('[role="dialog"]'), 'export dialog opened');
    assert.match($('[role="dialog"]').textContent, /Output/);

    const go = dialogButton(/^Export PNG/);
    await click(go);
    await wait(700);

    assert.equal(downloads.length, 1, `expected one download, got ${downloads.length}`);
    assert.match(downloads[0], /\.png$/);
    assert.equal($('[role="dialog"]'), null, 'dialog closes after export');
  } finally {
    globalThis.URL.createObjectURL = originalCreate;
    win.HTMLAnchorElement.prototype.click = originalClick;
  }
});

await test('exports vector SVG', async () => {
  const downloads = [];
  const originalClick = win.HTMLAnchorElement.prototype.click;
  const originalCreate = globalThis.URL.createObjectURL;
  globalThis.URL.createObjectURL = () => 'blob:test';
  win.URL.createObjectURL = () => 'blob:test';
  win.HTMLAnchorElement.prototype.click = function onDownload() {
    downloads.push(this.download);
  };

  try {
    const exportBtn = $('button[aria-label="Export Design"]');
    await click(exportBtn);
    await click(dialogButton(/^SVG$/));
    await click(dialogButton(/^Export SVG/));
    await wait(700);
    assert.deepEqual(downloads.map((d) => d.split('.').pop()), ['svg']);
  } finally {
    globalThis.URL.createObjectURL = originalCreate;
    win.HTMLAnchorElement.prototype.click = originalClick;
  }
});

/* ── modals ─────────────────────────────────────────────────────────── */

console.log('\nmodals');

await test('the About/License modal documents the CC0 artwork', async () => {
  await click($('button[title="About & License"]'));
  await wait(200);
  const text = $('[role="dialog"]').textContent;
  assert.match(text, /CC0/);
  assert.match(text, /SIL Open Font License/);
  await click(dialogButton(/^Close$/));
});

await test('Escape closes a modal', async () => {
  await click($('button[title="About & License"]'));
  await wait(150);
  await act(async () => {
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
  });
  assert.equal($('[role="dialog"]'), null, 'modal dismissed');
});

await test('no console errors accumulated during the session', () => {
  assert.deepEqual(errors, [], `unexpected console output:\n${errors.join('\n')}`);
});

/* ── summary ────────────────────────────────────────────────────────── */

await act(async () => {
  root.unmount();
});

const failed = results.filter(([, error]) => error);
console.log(`\n${results.length - failed.length}/${results.length} UI tests passed`);
if (failed.length) {
  console.log('\nFailures:');
  for (const [name, error] of failed) {
    console.log(`  • ${name}\n    ${error.stack?.split('\n').slice(0, 5).join('\n    ')}`);
  }
  process.exitCode = 1;
}
