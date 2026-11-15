/**
 * @file test/setup-dom.mjs
 * @description Headless DOM environment for the test suite.
 *
 * Fabric.js needs a real 2D rasteriser; `@napi-rs/canvas` provides one as a
 * prebuilt native module (no compiler required). jsdom supplies the rest of the
 * DOM. The patches below fill the handful of gaps jsdom leaves:
 *
 *   • `<canvas>.getContext('2d')` → a @napi-rs/canvas context
 *   • `createPattern` / `drawImage` → unwrap our canvas proxies
 *   • `ResizeObserver`, `getBoundingClientRect`, `document.fonts`
 *
 * Import this module **before** anything that touches `window` or Fabric.
 */

import { JSDOM } from 'jsdom';
import { createCanvas } from '@napi-rs/canvas';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});

const { window } = dom;

global.window = window;
global.document = window.document;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });

for (const key of [
  'HTMLElement',
  'HTMLCanvasElement',
  'HTMLImageElement',
  'HTMLAnchorElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'Image',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'PointerEvent',
  'DOMParser',
  'getComputedStyle',
  'ImageData',
  'SVGElement',
  'Node',
  'Element',
  'CustomEvent',
  'Blob',
  'FileReader',
  'File',
]) {
  if (window[key] !== undefined) global[key] = window[key];
}

/* ── animation & environment ────────────────────────────────────────── */

global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
global.cancelAnimationFrame = clearTimeout;
global.devicePixelRatio = 1;
global.IS_REACT_ACT_ENVIRONMENT = true;

/* ── jsdom gaps ─────────────────────────────────────────────────────── */

window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
global.ResizeObserver = window.ResizeObserver;

/** Every element reports a generous box so layout maths has something to bite. */
window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { x: 0, y: 0, top: 0, left: 0, width: 1200, height: 800, right: 1200, bottom: 800, toJSON() {} };
};
Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
  get() {
    return this.parentNode;
  },
});
window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
window.confirm = () => true;
window.matchMedia =
  window.matchMedia ||
  (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));

if (!window.document.fonts) {
  Object.defineProperty(window.document, 'fonts', {
    value: { load: () => Promise.resolve([]), ready: Promise.resolve() },
    configurable: true,
  });
}
global.document = window.document;

/* ── 2D rasteriser ──────────────────────────────────────────────────── */

window.HTMLCanvasElement.prototype.getContext = function getContext(type) {
  if (type !== '2d') return null;
  if (!this._ctx) {
    const real = createCanvas(this.width || 300, this.height || 150);
    this._ctx = real.getContext('2d');
    this._real = real;
  }
  return this._ctx;
};
window.HTMLCanvasElement.prototype.toDataURL = function toDataURL(type = 'image/png') {
  return this._real ? this._real.toDataURL(type) : 'data:image/png;base64,';
};

// @napi-rs/canvas only accepts its own objects; Fabric passes its cached
// canvases, so unwrap transparently and degrade gracefully.
{
  const proto = createCanvas(1, 1).getContext('2d').constructor.prototype;
  const originalPattern = proto.createPattern;
  const originalDraw = proto.drawImage;
  proto.createPattern = function createPattern(img, repetition) {
    try {
      return originalPattern.call(this, img?._real || img, repetition);
    } catch {
      return null;
    }
  };
  proto.drawImage = function drawImage(img, ...args) {
    try {
      return originalDraw.call(this, img?._real || img, ...args);
    } catch {
      return undefined;
    }
  };
}

/** Minimal image stand-in that resolves immediately. */
window.Image = class MockImage {
  constructor() {
    this.width = 256;
    this.height = 256;
  }
  set src(value) {
    this._src = value;
    setTimeout(() => this.onload?.(), 0);
  }
  get src() {
    return this._src;
  }
  decode() {
    return Promise.resolve();
  }
};
global.Image = window.Image;
window.HTMLImageElement = window.Image;

export const win = window;
export const doc = window.document;
export { createCanvas };
