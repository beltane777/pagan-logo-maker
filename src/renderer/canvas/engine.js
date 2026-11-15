/**
 * @file src/renderer/canvas/engine.js
 * @description The Fabric.js canvas engine — the single place that mutates the
 * design document.
 *
 * Architecture
 * ────────────
 * ```
 *  React UI  ──intent──▶  engine.addSymbol()  ──mutate──▶  Fabric canvas
 *      ▲                        │
 *      └──── setLayers() ───────┘  (engine reports a flattened LayerMeta list)
 * ```
 * React never touches Fabric directly; Fabric never reads React state. The
 * engine owns:
 *
 *   • object creation (symbols, text, shapes, imported rasters),
 *   • transform/selection sync (position, scale, rotation, opacity),
 *   • layer ordering, grouping, locking and visibility,
 *   • alignment guides + snapping,
 *   • serialisation to a portable `.plogo` document and to PNG/SVG/JPEG.
 *
 * Every public method is documented; extend the file by adding methods to the
 * returned `engine` object and matching them in {@link LayerMeta}.
 *
 * @see ./text.js, ../lib/finishes.js
 */

import {
  Canvas,
  FabricImage,
  Group,
  ActiveSelection,
  Rect,
  Circle,
  Line,
  Polygon,
  Shadow,
  loadSVGFromString,
  util,
} from 'fabric';
import { applyFinish, svgToDataUrl, getFinish } from '../lib/finishes';
import { buildTextObject, DEFAULT_TEXT } from './text';

/**
 * @typedef {Object} LayerMeta
 * @property {string} id            stable layer id
 * @property {string} name          display name
 * @property {'symbol'|'text'|'shape'|'image'|'group'} kind
 * @property {number} opacity       0–1
 * @property {boolean} visible
 * @property {boolean} locked
 * @property {string} [finishId]    active material finish for vector layers
 * @property {string} [color]       resolved primary colour
 * @property {string} [assetId]     library asset id (symbols only)
 * @property {string} [svg]         raw source markup (symbols only)
 * @property {Partial<import('./text').TextConfig>} [text] text config (text only)
 * @property {string} [thumb]       data-URL preview for the layer row
 * @property {string[]} [children]  child layer ids (groups only)
 */

/**
 * @typedef {Object} DesignDocument
 * @property {number} version
 * @property {{width:number,height:number,background:string,backgroundFinish:string}} artboard
 * @property {LayerMeta[]} layers
 * @property {{name:string, description:string, author:string, tags:string[]}} meta
 * @property {Array<object>} [scene] raw Fabric JSON for exact round-tripping
 */

/** Registry of live layer → Fabric object, keyed by layer id. */
const objects = new Map();
/** Object → layer id, for reverse lookups from Fabric events. */
const ids = new WeakMap();

/** Distance (px, canvas space) at which guides snap. */
const SNAP_THRESHOLD = 8;

/** Cycling palette for new layer swatches. */
const SWATCHES = ['#d4af4f', '#e3c878', '#c46a3b', '#6f8f5f', '#8c2b32', '#cfd6dd'];

let counter = 0;
/** @returns {string} a short unique id */
const nextId = (prefix = 'layer') => `${prefix}-${Date.now().toString(36)}-${(++counter).toString(36)}`;

export class CanvasEngine {
  /**
   * @param {HTMLCanvasElement} element
   * @param {object} hooks  callbacks into the React layer
   * @param {(layers: LayerMeta[], opts?: {history?: boolean}) => void} hooks.onLayers
   * @param {(ids: string[]) => void} hooks.onSelection
   * @param {(patch: {zoom?: number}) => void} hooks.onViewport
   */
  constructor(element, hooks, options = {}) {
    this.hooks = hooks;
    /** @type {import('fabric').Canvas} */
    this.canvas = new Canvas(element, {
      backgroundColor: '#0d0c12',
      preserveObjectStacking: true,
      selection: true,
      selectionColor: 'rgba(212,175,79,0.08)',
      selectionBorderColor: 'rgba(212,175,79,0.55)',
      selectionLineWidth: 1,
      uniformScaling: false,
      stopContextMenu: true,
      fireRightClick: true,
      controlsAboveOverlay: true,
      enableRetinaScaling: true,
    });

    /** @type {import('../store/useDesignStore').DEFAULT_ARTBOARD} */
    this.artboard = { width: 1200, height: 1200, background: '#0d0c12', backgroundFinish: 'solid' };
    /** @type {import('fabric').FabricObject[]} */
    this.guides = [];
    this.showGrid = false;
    this.snapToGrid = false;
    this.gridSize = 40;
    this.gridLines = [];
    /** Base scale to fit the artboard in the viewport. */
    this.fitScale = 1;
    /** User zoom multiplier on top of `fitScale`. */
    this.userZoom = 1;
    /** Internal clipboard. @type {object[]} */
    this.clipboard = [];
    /** Mirror of the store's layer metadata (kept in sync via #layersMeta). */
    /** @type {LayerMeta[]} */
    this.currentMeta = [];
    /** Notified with the layer list whenever transforms change. */
    this.onTransform = hooks.onTransform || null;
    /** Candidate font families, pre-warmed for curved-text metrics. */
    this.fonts = options.fonts || [];
    /** Guards against hook→engine→hook feedback loops. */
    this._emitting = false;
    /** Fonts already warmed by `warmFonts()`. */
    this._warmed = false;

    this.#installEvents();
    this.#installKeyboard();
  }

  /* ══════════════════════════════ setup ══════════════════════════════ */

  /** Wire Fabric events to the store hooks. */
  #installEvents() {
    const c = this.canvas;

    c.on('selection:created', (e) => this.#emitSelection(e.selected));
    c.on('selection:updated', (e) => this.#emitSelection(e.selected));
    c.on('selection:cleared', () => this.hooks.onSelection([]));

    c.on('object:modified', (e) => {
      this.#syncFromObjects(e.target ? [e.target] : []);
      this.#emitLayers({ history: true });
    });

    c.on('object:moving', (e) => this.#applySnapping(e.target));
    c.on('object:scaling', () => this.#hideGuides());
    c.on('object:rotating', (e) => {
      if (e.target) e.target.set({ angle: Math.round(e.target.angle) });
      this.#hideGuides();
    });
    c.on('mouse:up', () => this.#hideGuides());
  }

  /**
   * Keyboard interactions that belong to the canvas rather than the store:
   * arrow-key nudging and delete.
   */
  #installKeyboard() {
    this._keydown = (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;

      const step = event.shiftKey ? 10 : 1;
      const active = this.canvas.getActiveObjects();
      if (!active.length) return;

      const deltas = {
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
      };
      if (deltas[event.key]) {
        event.preventDefault();
        const [dx, dy] = deltas[event.key];
        active.forEach((o) => o.set({ left: o.left + dx, top: o.top + dy }));
        this.canvas.requestRenderAll();
        this.#syncFromObjects(active);
        this.#emitLayers({ history: false });
        this.hooks.onTransientEnd?.();
      }
    };
    window.addEventListener('keydown', this._keydown);
  }

  /* ════════════════════════════ artboard ════════════════════════════ */

  /**
   * Size the canvas to the artboard and fit it into the viewport.
   * @param {{width:number,height:number,background:string}} artboard
   * @param {{width:number,height:number}} viewport available space in px
   */
  setArtboard(artboard, viewport) {
    const changed =
      !this.artboard ||
      this.artboard.width !== artboard.width ||
      this.artboard.height !== artboard.height ||
      this.artboard.background !== artboard.background;
    this.artboard = { ...this.artboard, ...artboard };
    const { width, height } = this.artboard;
    const padding = 96;
    this.fitScale = Math.min(
      (viewport.width - padding) / width,
      (viewport.height - padding) / height,
      1,
    );

    this.canvas.setDimensions({ width: viewport.width, height: viewport.height });
    this.canvas.backgroundColor = this.artboard.background;
    this.applyZoom();
    this.#drawGrid();
    this.#drawArtboardFrame();
  }

  /** Recompute the canvas transform from `fitScale * userZoom`. */
  applyZoom() {
    const zoom = this.fitScale * this.userZoom;
    const { width, height } = this.artboard;
    const vw = this.canvas.getWidth();
    const vh = this.canvas.getHeight();

    this.canvas.setViewportTransform([zoom, 0, 0, zoom, (vw - width * zoom) / 2, (vh - height * zoom) / 2]);
    this.canvas.requestRenderAll();
    this.hooks.onViewport?.({ zoom: this.userZoom, fitScale: this.fitScale });
  }

  /**
   * Pre-load every candidate typeface so curved-text metrics are correct the
   * first time a layer is created. Safe to call repeatedly.
   */
  async warmFonts() {
    if (this._warmed || !document.fonts?.load) return;
    this._warmed = true;
    await Promise.allSettled(
      this.fonts.map((family) => document.fonts.load(`16px "${family}"`)),
    );
  }

  /**
   * Fit + recentre the artboard without disturbing layer objects. Used on
   * window resize so the design never shifts.
   * @param {{width:number,height:number}} viewport
   */
  resize(viewport) {
    const padding = 96;
    this.fitScale = Math.min(
      (viewport.width - padding) / this.artboard.width,
      (viewport.height - padding) / this.artboard.height,
      1,
    );
    this.canvas.setDimensions({ width: viewport.width, height: viewport.height });
    this.applyZoom();
    this.#drawGrid();
  }

  /**
   * Set the user zoom multiplier (relative to the fit scale).
   * @param {number} zoom
   */
  setZoom(zoom) {
    this.userZoom = Math.min(6, Math.max(0.15, zoom));
    this.applyZoom();
  }

  /** Zoom relative to the current level. @param {number} factor */
  zoomBy(factor) {
    this.setZoom(this.userZoom * factor);
  }

  /** Reset to the fitted view. */
  zoomFit() {
    this.setZoom(1);
  }

  /** @returns {number} effective on-screen scale (fit × user zoom) */
  getScale() {
    return this.fitScale * this.userZoom;
  }

  /* ══════════════════════════ layer creation ════════════════════════ */

  /**
   * Place a vector symbol from the vault onto the canvas.
   *
   * @param {Object} asset
   * @param {string} asset.id      manifest id, e.g. `pentacle`
   * @param {string} asset.name    human label
   * @param {string} asset.svg     raw SVG markup
   * @param {string} [finishId]    material finish, defaults to antique gold
   * @param {{left?:number, top?:number, scale?:number, asBackground?:boolean}} [placement]
   *   `asBackground` stretches the artwork to fill the artboard and pushes it to
   *   the bottom of the stack — the behaviour expected of texture/background
   *   assets in the Vault.
   * @returns {Promise<LayerMeta>}
   */
  async addSymbol(asset, finishId = 'gold', placement = {}) {
    const isBackground = !!placement.asBackground;
    const id = nextId('sym');
    const painted = applyFinish(asset.svg, finishId);

    const object = await this.#objectFromSvg(painted, {
      left: placement.left ?? this.artboard.width / 2,
      top: placement.top ?? this.artboard.height / 2,
      scale: placement.scale ?? (this.artboard.width / 256) * 0.62,
    });

    object.set({ plmName: asset.name });
    ids.set(object, id);
    objects.set(id, object);
    this.canvas.add(object);

    if (isBackground) {
      // Fit the artwork to the artboard and drop it to the back.
      const scale = Math.max(this.artboard.width / 256, this.artboard.height / 256);
      object.set({
        left: this.artboard.width / 2,
        top: this.artboard.height / 2,
        scaleX: scale,
        scaleY: scale,
      });
      this.canvas.sendObjectToBack(object);
    } else {
      this.canvas.setActiveObject(object);
    }
    this.canvas.requestRenderAll();

    const layer = {
      id,
      name: asset.name,
      kind: isBackground ? 'background' : 'symbol',
      opacity: 1,
      visible: true,
      locked: false,
      finishId,
      color: getFinish(finishId).stops[1]?.[1] ?? '#d4af4f',
      assetId: asset.id,
      svg: asset.svg,
      thumb: svgToDataUrl(painted),
      scale: isBackground ? 'cover' : undefined,
    };
    this.#registerMeta(layer);
    this.#emitLayers();
    return layer;
  }

  /**
   * Rasterise imported or custom SVG markup into a Fabric object.
   * @param {string} svgText
   * @param {{left:number, top:number, scale:number}} placement
   * @returns {Promise<import('fabric').FabricObject>}
   */
  async #objectFromSvg(svgText, placement) {
    const { objects: parsed } = await loadSVGFromString(svgText);
    const cleaned = parsed.filter((o) => o && o.type !== 'text'); // drop <title>
    const group = util.groupSVGElements(cleaned);
    group.set({
      left: placement.left,
      top: placement.top,
      originX: 'center',
      originY: 'center',
      scaleX: placement.scale,
      scaleY: placement.scale,
      objectCaching: true,
    });
    group.setControlsVisibility({ mt: true, mb: true });
    return group;
  }

  /**
   * Add a text layer.
   * @param {Partial<import('./text').TextConfig>} config
   * @param {{left?:number, top?:number}} [placement]
   * @returns {Promise<LayerMeta>}
   */
  async addText(config = {}, placement = {}) {
    const id = nextId('txt');
    const cfg = { ...DEFAULT_TEXT, ...config };
    const object = await buildTextObject(cfg, {
      left: placement.left ?? this.artboard.width / 2,
      top: placement.top ?? this.artboard.height / 2,
    });
    object.set({ plmName: cfg.text.slice(0, 24) || 'Text' });
    ids.set(object, id);
    objects.set(id, object);
    this.canvas.add(object);
    this.canvas.setActiveObject(object);
    this.canvas.requestRenderAll();

    const layer = {
      id,
      name: cfg.text.slice(0, 22) || 'Text',
      kind: 'text',
      opacity: 1,
      visible: true,
      locked: false,
      color: cfg.fill,
      text: cfg,
      thumb: this.#textThumb(cfg),
    };
    this.#registerMeta(layer);
    this.#emitLayers();
    return layer;
  }

  /**
   * Add a primitive shape (used by the toolbar's shape menu and templates).
   * @param {'rect'|'circle'|'triangle'|'hexagon'|'line'} shape
   * @param {{fill?:string, stroke?:string, strokeWidth?:number, left?:number, top?:number, size?:number}} [opts]
   * @returns {LayerMeta}
   */
  addShape(shape, opts = {}) {
    const id = nextId('shp');
    const size = opts.size ?? Math.min(this.artboard.width, this.artboard.height) * 0.3;
    const common = {
      left: opts.left ?? this.artboard.width / 2,
      top: opts.top ?? this.artboard.height / 2,
      originX: 'center',
      originY: 'center',
      fill: opts.fill ?? 'transparent',
      stroke: opts.stroke ?? '#d4af4f',
      strokeWidth: opts.strokeWidth ?? 6,
      strokeUniform: true,
    };

    let object;
    switch (shape) {
      case 'circle':
        object = new Circle({ ...common, radius: size / 2 });
        break;
      case 'triangle':
        object = new Polygon(
          [
            { x: 0, y: -size / 2 },
            { x: size / 2, y: size / 2 },
            { x: -size / 2, y: size / 2 },
          ],
          common,
        );
        break;
      case 'hexagon':
        object = new Polygon(
          Array.from({ length: 6 }, (_, i) => {
            const a = (i * Math.PI * 2) / 6 - Math.PI / 2;
            return { x: Math.cos(a) * (size / 2), y: Math.sin(a) * (size / 2) };
          }),
          common,
        );
        break;
      case 'line':
        object = new Line([0, 0, size, 0], {
          ...common,
          left: common.left,
          top: common.top,
          originX: 'center',
          originY: 'center',
        });
        break;
      case 'rect':
      default:
        object = new Rect({ ...common, width: size, height: size, rx: 0 });
    }

    const label = shape.charAt(0).toUpperCase() + shape.slice(1);
    object.set({ plmName: label });
    ids.set(object, id);
    objects.set(id, object);
    this.canvas.add(object);
    this.canvas.setActiveObject(object);
    this.canvas.requestRenderAll();

    const layer = {
      id,
      name: label,
      kind: 'shape',
      opacity: 1,
      visible: true,
      locked: false,
      color: opts.stroke ?? '#d4af4f',
      shape,
      thumb: this.#shapeThumb(shape, opts.stroke ?? '#d4af4f'),
    };
    this.#registerMeta(layer);
    this.#emitLayers();
    return layer;
  }

  /**
   * Place an imported raster image.
   * @param {string} dataUrl
   * @param {string} [name]
   * @returns {Promise<LayerMeta>}
   */
  async addImage(dataUrl, name = 'Imported Image') {
    const id = nextId('img');
    const img = await FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });
    const scale = Math.min(
      (this.artboard.width * 0.6) / img.width,
      (this.artboard.height * 0.6) / img.height,
      1,
    );
    img.set({
      left: this.artboard.width / 2,
      top: this.artboard.height / 2,
      originX: 'center',
      originY: 'center',
      scaleX: scale,
      scaleY: scale,
      plmName: name,
    });
    ids.set(img, id);
    objects.set(id, img);
    this.canvas.add(img);
    this.canvas.setActiveObject(img);
    this.canvas.requestRenderAll();

    const layer = {
      id,
      name,
      kind: 'image',
      opacity: 1,
      visible: true,
      locked: false,
      thumb: dataUrl,
    };
    this.#registerMeta(layer);
    this.#emitLayers();
    return layer;
  }

  /* ════════════════════════ layer manipulation ══════════════════════ */

  /**
   * Remove layers by id.
   * @param {string[]} layerIds
   */
  removeLayers(layerIds) {
    layerIds.forEach((id) => {
      const obj = objects.get(id);
      if (obj) {
        this.canvas.remove(obj);
        objects.delete(id);
      }
    });
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.#emitLayers();
  }

  /**
   * Duplicate layers, offsetting the copies.
   * @param {string[]} layerIds
   */
  async duplicateLayers(layerIds) {
    for (const id of layerIds) {
      const src = objects.get(id);
      if (!src) continue;
      const clone = await src.clone();
      const newId = nextId('dup');
      clone.set({
        left: src.left + 24,
        top: src.top + 24,
        plmName: `${src.plmName || 'Layer'} copy`,
      });
      ids.set(clone, newId);
      objects.set(newId, clone);
      this.canvas.add(clone);
    }
    this.canvas.requestRenderAll();
    this.#emitLayers();
  }

  /** Copy the current selection to the internal clipboard. */
  async copySelection() {
    const active = this.canvas.getActiveObjects();
    this.clipboard = await Promise.all(active.map((o) => o.clone()));
  }

  /** Paste the internal clipboard, offset by 24px. */
  async paste() {
    if (!this.clipboard.length) return;
    for (const proto of this.clipboard) {
      const clone = await proto.clone();
      const newId = nextId('pst');
      clone.set({ left: clone.left + 24, top: clone.top + 24 });
      ids.set(clone, newId);
      objects.set(newId, clone);
      this.canvas.add(clone);
    }
    this.canvas.requestRenderAll();
    this.#emitLayers();
  }

  /**
   * Reorder a layer within the stack.
   * @param {string} id
   * @param {'front'|'back'|'forward'|'backward'} where
   */
  reorderLayer(id, where) {
    const obj = objects.get(id);
    if (!obj) return;
    switch (where) {
      case 'front':
        this.canvas.bringObjectToFront(obj);
        break;
      case 'back':
        this.canvas.sendObjectToBack(obj);
        break;
      case 'forward':
        this.canvas.bringObjectForward(obj);
        break;
      case 'backward':
        this.canvas.sendObjectBackwards(obj);
        break;
      default:
        break;
    }
    this.canvas.requestRenderAll();
    this.#emitLayers();
  }

  /**
   * Move a layer to an absolute stack index (0 = bottom of the design stack).
   *
   * Used by drag & drop in the layer panel. Indices are expressed over *design*
   * objects only — overlays (artboard frame, grid, guides) are excluded and are
   * always re-appended on top so they never intercept clicks or exports.
   *
   * @param {string} id
   * @param {number} index position among design objects, bottom-first
   */
  moveLayerToIndex(id, index) {
    const obj = objects.get(id);
    if (!obj) return;

    const design = this.#designObjects();
    const from = design.indexOf(obj);
    if (from < 0) return;

    const target = Math.max(0, Math.min(design.length - 1, index));
    if (target === from) return;

    design.splice(from, 1);
    design.splice(target, 0, obj);

    // Rebuild the canvas stack: reordered design objects first, overlays last.
    // `Canvas#moveObjectTo` cannot express this because its indices include
    // overlays, so we assemble the array directly (the same field Fabric's own
    // reordering helpers mutate).
    const overlays = this.canvas.getObjects().filter((o) => o.plmOverlay);
    this.canvas._objects = [...design, ...overlays];

    this.canvas.requestRenderAll();
    this.#emitLayers();
  }

  /**
   * Apply layer property changes that live on the Fabric object.
   * @param {string} id
   * @param {{opacity?:number, visible?:boolean, locked?:boolean}} patch
   */
  applyLayerProps(id, patch) {
    const obj = objects.get(id);
    if (!obj) return;
    if (typeof patch.opacity === 'number') obj.set({ opacity: patch.opacity });
    if (typeof patch.visible === 'boolean') obj.set({ visible: patch.visible });
    if (typeof patch.locked === 'boolean') {
      obj.set({
        selectable: !patch.locked,
        evented: !patch.locked,
        lockMovementX: patch.locked,
        lockMovementY: patch.locked,
        lockRotation: patch.locked,
        lockScalingX: patch.locked,
        lockScalingY: patch.locked,
        hasControls: !patch.locked,
      });
      if (patch.locked && this.canvas.getActiveObjects().includes(obj)) {
        this.canvas.discardActiveObject();
      }
    }
    this.canvas.requestRenderAll();
    this.#emitLayers({ history: false });
  }

  /**
   * Align the active object(s) within the artboard.
   * @param {'left'|'center-h'|'right'|'top'|'center-v'|'bottom'|'center'} how
   */
  alignSelection(how) {
    const active = this.canvas.getActiveObjects();
    if (!active.length) return;
    const W = this.artboard.width;
    const H = this.artboard.height;

    active.forEach((obj) => {
      const b = obj.getBoundingRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      switch (how) {
        case 'left':
          obj.set({ left: obj.left + (0 + b.width / 2 - cx) });
          break;
        case 'right':
          obj.set({ left: obj.left + (W - b.width / 2 - cx) });
          break;
        case 'center-h':
          obj.set({ left: obj.left + (W / 2 - cx) });
          break;
        case 'top':
          obj.set({ top: obj.top + (0 + b.height / 2 - cy) });
          break;
        case 'bottom':
          obj.set({ top: obj.top + (H - b.height / 2 - cy) });
          break;
        case 'center-v':
          obj.set({ top: obj.top + (H / 2 - cy) });
          break;
        case 'center':
        default:
          obj.set({ left: obj.left + (W / 2 - cx), top: obj.top + (H / 2 - cy) });
      }
      obj.setCoords();
    });
    this.canvas.requestRenderAll();
    this.#syncFromObjects(active);
    this.#emitLayers();
  }

  /**
   * Restyle a symbol layer with a different material finish.
   * @param {string} layerId
   * @param {string} finishId
   * @param {LayerMeta} layer the layer metadata (carries the raw svg)
   */
  async restyleSymbol(layerId, finishId, layer) {
    const old = objects.get(layerId);
    if (!old || !layer.svg) return;
    const painted = applyFinish(layer.svg, finishId);
    const replacement = await this.#objectFromSvg(painted, {
      left: old.left,
      top: old.top,
      scale: old.scaleX,
    });
    // Background layers are anisotropic (cover-fit), so copy scaleY separately.
    if (old.scaleY && Math.abs(old.scaleY - old.scaleX) > 0.001) {
      replacement.set({ scaleY: old.scaleY });
    }
    replacement.set({
      angle: old.angle,
      opacity: old.opacity,
      visible: old.visible,
      plmName: old.plmName,
      originX: 'center',
      originY: 'center',
    });

    const wasActive = this.canvas.getActiveObjects().includes(old);
    this.canvas.remove(old);
    objects.set(layerId, replacement);
    ids.set(replacement, layerId);
    this.canvas.add(replacement);
    if (wasActive) this.canvas.setActiveObject(replacement);
    this.canvas.requestRenderAll();

    // Patch the stored descriptor directly: the Fabric object for a symbol is a
    // generic group, so re-deriving metadata from it would lose the asset name,
    // kind and raw SVG source.
    this.currentMeta = (this.currentMeta || []).map((l) =>
      l.id === layerId ? { ...l, finishId, thumb: svgToDataUrl(painted) } : l,
    );
    this.#emitLayers();
  }

  /**
   * Update typographic properties, rebuilding the object when needed.
   * @param {string} layerId
   * @param {Partial<import('./text').TextConfig>} patch
   * @param {LayerMeta} layer
   * @param {{transient?: boolean}} [opts] `transient` avoids one history entry
   *   per slider tick
   */
  async updateTextStyle(layerId, patch, layer, opts = {}) {
    const old = objects.get(layerId);
    if (!old) return;
    const cfg = { ...DEFAULT_TEXT, ...(layer.text || {}), ...patch };

    // Flat text can be updated in place (cheap, keeps the caret position).
    if (!cfg.curve && old.type === 'textbox') {
      old.set({
        text: cfg.uppercase ? cfg.text.toUpperCase() : cfg.text,
        fontFamily: cfg.fontFamily,
        fontSize: cfg.fontSize,
        fontWeight: cfg.fontWeight,
        fontStyle: cfg.italic ? 'italic' : 'normal',
        fill: cfg.fill,
        charSpacing: cfg.letterSpacing * 10,
        lineHeight: cfg.lineHeight,
        textAlign: cfg.align,
        shadow: cfg.shadowDepth
          ? new Shadow({
              color: cfg.shadowColor,
              blur: cfg.shadowDepth * 1.6,
              offsetX: cfg.shadowDepth * 0.45,
              offsetY: cfg.shadowDepth * 0.6,
            })
          : null,
      });
      old.initDimensions?.();
      old.setCoords();
      this.canvas.requestRenderAll();
    } else {
      // Curved (or switching between curved/flat): rebuild the object.
      const replacement = await buildTextObject(cfg, { left: old.left, top: old.top });
      replacement.set({ angle: old.angle, opacity: old.opacity, plmName: old.plmName });
      const wasActive = this.canvas.getActiveObjects().includes(old);
      this.canvas.remove(old);
      objects.set(layerId, replacement);
      ids.set(replacement, layerId);
      this.canvas.add(replacement);
      if (wasActive) this.canvas.setActiveObject(replacement);
      this.canvas.requestRenderAll();
    }

    this.currentMeta = (this.currentMeta || []).map((l) =>
      l.id === layerId
        ? { ...l, text: cfg, name: cfg.text.slice(0, 22) || 'Text', color: cfg.fill, thumb: this.#textThumb(cfg) }
        : l,
    );
    this.#emitLayers({ history: !opts.transient });
  }

  /**
   * Group the current selection into a single layer.
   *
   * The selection is discarded first so Fabric emits no ActiveSelection-owned
   * events while the stack is rebuilt; the children are then removed from the
   * canvas explicitly, because `new Group(items)` does not detach them.
   *
   * @returns {Promise<void>}
   */
  async groupSelection() {
    const active = this.canvas.getActiveObjects().filter((o) => !o.plmOverlay);
    if (active.length < 2) return;

    this.canvas.discardActiveObject();

    // Detach the children and forget their layer ids.
    const absorbed = [];
    active.forEach((obj) => {
      this.canvas.remove(obj);
      const childId = ids.get(obj);
      if (childId) {
        absorbed.push(childId);
        objects.delete(childId);
      }
    });
    this.currentMeta = (this.currentMeta || []).filter((m) => !absorbed.includes(m.id));

    const group = new Group(active, { subTargetCheck: true, interactive: false });
    const id = nextId('grp');
    group.set({ plmName: 'Group' });
    ids.set(group, id);
    objects.set(id, group);
    this.canvas.add(group);
    this.canvas.setActiveObject(group);
    this.canvas.requestRenderAll();

    this.#registerMeta({
      id,
      name: 'Group',
      kind: 'group',
      opacity: 1,
      visible: true,
      locked: false,
      children: absorbed,
    });
    this.#emitLayers();
  }

  /** Ungroup the active group(s). */
  ungroupSelection() {
    const active = this.canvas.getActiveObjects().filter((o) => o.type === 'group');
    active.forEach((group) => {
      const parentId = ids.get(group);
      const children = group.removeAll();
      this.canvas.remove(group);
      if (parentId) objects.delete(parentId);
      children.forEach((child) => {
        const id = nextId('obj');
        ids.set(child, id);
        objects.set(id, child);
        this.canvas.add(child);
      });
    });
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.#emitLayers();
  }

  /** Select every unlocked, visible object. */
  selectAll() {
    const selectable = [...objects.values()].filter((o) => o.visible && o.selectable);
    if (!selectable.length) return;
    this.canvas.discardActiveObject();
    if (selectable.length === 1) {
      this.canvas.setActiveObject(selectable[0]);
    } else {
      this.canvas.setActiveObject(new ActiveSelection(selectable, { canvas: this.canvas }));
    }
    this.canvas.requestRenderAll();
    this.#emitSelection(this.canvas.getActiveObjects());
  }

  /** Clear the selection. */
  deselect() {
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  /* ══════════════════════════ grid & guides ══════════════════════════ */

  /** Toggle the artboard grid overlay. @param {boolean} on */
  setGridVisible(on) {
    this.showGrid = on;
    this.#drawGrid();
  }

  /** @param {boolean} on */
  setSnapToGrid(on) {
    this.snapToGrid = on;
  }

  /** @param {number} size */
  setGridSize(size) {
    this.gridSize = Math.max(4, size);
    this.#drawGrid();
  }

  /** Redraw the grid + artboard frame as non-exportable canvas overlays. */
  #drawGrid() {
    this.#clearGrid();
    const { width, height } = this.artboard;

    // Artboard frame
    const frame = new Rect({
      left: 0,
      top: 0,
      width,
      height,
      fill: 'transparent',
      stroke: 'rgba(212,175,79,0.28)',
      strokeWidth: 1 / this.getScale(),
      selectable: false,
      evented: false,
      excludeFromExport: true,
      hoverCursor: 'default',
    });
    frame.set({ plmOverlay: true });
    this.canvas.add(frame);
    this.gridLines.push(frame);

    if (this.showGrid) {
      for (let x = this.gridSize; x < width; x += this.gridSize) {
        const line = new Line([x, 0, x, height], {
          stroke: 'rgba(255,255,255,0.06)',
          strokeWidth: 1 / this.getScale(),
          selectable: false,
          evented: false,
          excludeFromExport: true,
        });
        line.set({ plmOverlay: true });
        this.canvas.add(line);
        this.gridLines.push(line);
      }
      for (let y = this.gridSize; y < height; y += this.gridSize) {
        const line = new Line([0, y, width, y], {
          stroke: 'rgba(255,255,255,0.06)',
          strokeWidth: 1 / this.getScale(),
          selectable: false,
          evented: false,
          excludeFromExport: true,
        });
        line.set({ plmOverlay: true });
        this.canvas.add(line);
        this.gridLines.push(line);
      }
    }

    // Keep overlays on top without disturbing stacking of real layers.
    this.gridLines.forEach((o) => this.canvas.bringObjectToFront(o));
    this.canvas.requestRenderAll();
  }

  /** No-op kept for symmetry — the frame is redrawn with the grid. */
  #drawArtboardFrame() {
    this.#drawGrid();
  }

  #clearGrid() {
    this.gridLines.forEach((o) => this.canvas.remove(o));
    this.gridLines = [];
  }

  /**
   * Snap an object to the artboard centre and edges while dragging, drawing
   * alignment guides.
   * @param {import('fabric').FabricObject} obj
   */
  #applySnapping(obj) {
    if (!obj) return;
    const { width: W, height: H } = this.artboard;
    const b = obj.getBoundingRect();
    const threshold = SNAP_THRESHOLD / this.getScale();

    this.#hideGuides();
    const candidates = {
      cx: W / 2,
      cy: H / 2,
      left: 0,
      right: W,
      top: 0,
      bottom: H,
    };

    const objCx = b.left + b.width / 2;
    const objCy = b.top + b.height / 2;

    const lines = [];

    if (Math.abs(objCx - candidates.cx) < threshold) {
      obj.set({ left: obj.left + (candidates.cx - objCx) });
      lines.push([candidates.cx, 0, candidates.cx, H]);
    } else if (Math.abs(b.left - candidates.left) < threshold) {
      obj.set({ left: obj.left + (candidates.left - b.left) });
      lines.push([0, 0, 0, H]);
    } else if (Math.abs(b.left + b.width - candidates.right) < threshold) {
      obj.set({ left: obj.left + (candidates.right - (b.left + b.width)) });
      lines.push([W, 0, W, H]);
    }

    if (Math.abs(objCy - candidates.cy) < threshold) {
      obj.set({ top: obj.top + (candidates.cy - objCy) });
      lines.push([0, candidates.cy, W, candidates.cy]);
    } else if (Math.abs(b.top - candidates.top) < threshold) {
      obj.set({ top: obj.top + (candidates.top - b.top) });
      lines.push([0, 0, W, 0]);
    } else if (Math.abs(b.top + b.height - candidates.bottom) < threshold) {
      obj.set({ top: obj.top + (candidates.bottom - (b.top + b.height)) });
      lines.push([0, H, W, H]);
    }

    if (this.snapToGrid) {
      const g = this.gridSize;
      obj.set({
        left: Math.round(obj.left / g) * g,
        top: Math.round(obj.top / g) * g,
      });
    }

    obj.setCoords();

    lines.forEach(([x1, y1, x2, y2]) => {
      const guide = new Line([x1, y1, x2, y2], {
        stroke: 'rgba(212,175,79,0.85)',
        strokeWidth: 1 / this.getScale(),
        strokeDashArray: [6 / this.getScale(), 4 / this.getScale()],
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
      guide.set({ plmOverlay: true });
      this.canvas.add(guide);
      this.canvas.bringObjectToFront(guide);
      this.guides.push(guide);
    });
  }

  #hideGuides() {
    this.guides.forEach((g) => this.canvas.remove(g));
    this.guides = [];
  }

  /* ═══════════════════════ serialisation / IO ═══════════════════════ */

  /** Objects that belong to the design (not overlays). */
  #designObjects() {
    return this.canvas.getObjects().filter((o) => !o.plmOverlay && o.type !== 'activeSelection');
  }

  /**
   * Apply numeric geometry (position/rotation/size) to a layer's object and
   * push the refreshed transform back into layer metadata.
   * @param {string} id
   * @param {{left?:number, top?:number, angle?:number, scaleX?:number, scaleY?:number}} patch
   * @param {{history?: boolean}} [opts]
   */
  setObjectGeometry(id, patch, opts = {}) {
    const obj = objects.get(id);
    if (!obj) return;
    obj.set(patch);
    obj.setCoords();
    this.canvas.requestRenderAll();
    this.#syncFromObjects([obj]);
    this.#emitLayers({ history: opts.history !== false });
  }

  /**
   * Register metadata for a freshly created layer, then publish the stack.
   * Must be called before `#emitLayers()` so `#layersMeta()` can merge the
   * existing descriptor instead of falling back to generic defaults.
   * @param {LayerMeta} layer
   */
  #registerMeta(layer) {
    this.currentMeta = [...(this.currentMeta || []).filter((m) => m.id !== layer.id), layer];
  }

  /**
   * Flatten the current canvas into the store's LayerMeta list.
   * Fabric's object order is bottom-first, so the panel reverses it.
   * @returns {LayerMeta[]}
   */
  #layersMeta() {
    /** @type {LayerMeta[]} */
    const meta = this.currentMeta ? [...this.currentMeta] : [];
    const list = this.#designObjects().map((obj, i) => {
      const id = ids.get(obj) || nextId('obj');
      ids.set(obj, id);
      const existing = meta.find((m) => m.id === id) || {};
      return {
        ...existing,
        id,
        name: existing.name || obj.plmName || obj.type || `Layer ${i + 1}`,
        kind: existing.kind || 'shape',
        opacity: typeof obj.opacity === 'number' ? obj.opacity : 1,
        visible: obj.visible !== false,
        locked: !obj.selectable,
        thumb: existing.thumb,
      };
    });
    this.currentMeta = list;
    return list;
  }

  /** Push the current layer list + selection to React. */
  #emitLayers(opts = {}) {
    const layers = this.#layersMeta();
    this.hooks.onLayers(layers, opts);
    // Transform metadata is only meaningful to the inspector, so notify it
    // separately (cheap) rather than re-rendering the whole tree.
    this.onTransform?.(layers);
  }

  /**
   * Copy transform state from Fabric objects back into the layer metadata.
   * @param {import('fabric').FabricObject[]} list
   */
  #syncFromObjects(list) {
    list.forEach((obj) => {
      const id = ids.get(obj);
      if (!id) return;
      const b = obj.getBoundingRect();
      this.currentMeta = (this.currentMeta || []).map((m) =>
        m.id === id
          ? {
              ...m,
              transform: {
                angle: Math.round(obj.angle),
                left: Math.round(b.left),
                top: Math.round(b.top),
                width: Math.round(b.width),
                height: Math.round(b.height),
              },
            }
          : m,
      );
    });
  }

  /** @param {import('fabric').FabricObject[]} selected */
  #emitSelection(selected = []) {
    this.hooks.onSelection(selected.map((o) => ids.get(o)).filter(Boolean));
  }

  /**
   * Seed the engine with metadata for a loaded document, then rebuild every
   * object from the serialised scene.
   * @param {DesignDocument} doc
   * @param {{width:number,height:number}} viewport
   */
  async loadDocument(doc, viewport) {
    this.currentMeta = doc.layers || [];
    objects.clear();
    this.canvas.clear();

    this.setArtboard(doc.artboard, viewport);

    if (doc.scene) {
      await this.canvas.loadFromJSON(doc.scene);
      // Re-establish id mappings by walk order.
      this.#designObjects().forEach((obj) => {
        if (obj.plmLayerId) {
          ids.set(obj, obj.plmLayerId);
          objects.set(obj.plmLayerId, obj);
        }
      });
      this.canvas.requestRenderAll();
    } else {
      // Rehydrate from portable layer metadata (custom templates).
      for (const layer of doc.layers) {
        if (layer.kind === 'symbol' && layer.svg) {
          const painted = applyFinish(layer.svg, layer.finishId || 'gold');
          const obj = await this.#objectFromSvg(painted, {
            left: layer.transform?.left ?? this.artboard.width / 2,
            top: layer.transform?.top ?? this.artboard.height / 2,
            scale: layer.transform ? 1 : (this.artboard.width / 256) * 0.62,
          });
          ids.set(obj, layer.id);
          objects.set(layer.id, obj);
          this.canvas.add(obj);
        } else if (layer.kind === 'text') {
          const obj = await buildTextObject(layer.text || {}, {
            left: layer.transform?.left ?? this.artboard.width / 2,
            top: layer.transform?.top ?? this.artboard.height / 2,
          });
          ids.set(obj, layer.id);
          objects.set(layer.id, obj);
          this.canvas.add(obj);
        }
      }
      this.canvas.requestRenderAll();
    }

    this.#drawGrid();
    this.hooks.onLayers(this.#layersMeta(), { history: false });
  }

  /**
   * Serialise the design for saving.
   * @param {{meta: object, artboard: object}} state
   * @returns {DesignDocument}
   */
  toDocument(state) {
    // Persist layer ids on the objects so reload can remap them.
    this.#designObjects().forEach((obj) => {
      const id = ids.get(obj);
      if (id) obj.set({ plmLayerId: id });
    });
    return {
      version: 1,
      artboard: { ...state.artboard },
      meta: { ...state.meta },
      layers: this.#layersMeta(),
      scene: this.canvas.toObject(['plmLayerId', 'plmName', 'plmType', 'plmArc', 'plmOverlay']),
    };
  }

  /* ═════════════════════════════ export ═════════════════════════════ */

  /**
   * Render the design to a bitmap at an arbitrary multiple of the artboard.
   *
   * Overlays (grid, guides) are excluded; the artboard background is included.
   *
   * @param {'png'|'jpeg'} format
   * @param {number} multiplier  output = artboard × multiplier (e.g. 4 for 4K)
   * @param {{transparent?: boolean}} [opts]
   * @returns {string} data URL
   */
  exportRaster(format = 'png', multiplier = 1, opts = {}) {
    const saved = {
      background: this.canvas.backgroundColor,
      width: this.canvas.getWidth(),
      height: this.canvas.getHeight(),
    };

    // Hide non-design overlays, reset the viewport, then size the canvas to the
    // artboard so `multiplier` maps directly onto output pixels.
    this.gridLines.forEach((o) => o.set({ visible: false }));
    this.guides.forEach((o) => o.set({ visible: false }));
    this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    this.canvas.setDimensions({ width: this.artboard.width, height: this.artboard.height });
    if (opts.transparent && format === 'png') this.canvas.backgroundColor = '';

    const dataUrl = this.canvas.toDataURL({
      format,
      quality: format === 'jpeg' ? 0.94 : 1,
      multiplier,
      enableRetinaScaling: false,
    });

    // Restore dimensions, background and the user's viewport.
    this.canvas.backgroundColor = saved.background ?? '';
    this.canvas.setDimensions({ width: saved.width, height: saved.height });
    this.gridLines.forEach((o) => o.set({ visible: true }));
    this.applyZoom();
    this.#drawGrid();
    return dataUrl;
  }

  /**
   * Render the design to standalone SVG markup.
   * @param {{transparent?: boolean}} [opts]
   * @returns {string}
   */
  exportSvg(opts = {}) {
    this.gridLines.forEach((o) => o.set({ visible: false }));
    const svg = this.canvas.toSVG({
      width: `${this.artboard.width}`,
      height: `${this.artboard.height}`,
      viewBox: { x: 0, y: 0, width: this.artboard.width, height: this.artboard.height },
      suppressPreamble: false,
    });
    this.gridLines.forEach((o) => o.set({ visible: true }));

    if (opts.transparent) {
      return svg.replace(/<rect[^>]*fill="[^"]*"[^>]*width="100%"[^>]*\/>/, '');
    }
    return svg;
  }

  /** Release listeners + Fabric resources. */
  destroy() {
    window.removeEventListener('keydown', this._keydown);
    this.canvas.destroy();
    objects.clear();
  }

  /* ────────────────────────── thumbnails ─────────────────────────── */

  /**
   * Tiny SVG preview for a text layer row.
   * @param {import('./text').TextConfig} cfg
   */
  #textThumb(cfg) {
    const label = (cfg.text || 'Aa').slice(0, 10);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#12111a"/><text x="32" y="40" fill="${
      cfg.fill || '#d4af4f'
    }" font-family="${cfg.fontFamily}" font-size="${Math.min(
      26,
      96 / Math.max(3, label.length),
    )}" text-anchor="middle">${label.replace(/[<>&]/g, '')}</text></svg>`;
    return svgToDataUrl(svg);
  }

  /**
   * Tiny SVG preview for a shape layer row.
   * @param {string} shape
   * @param {string} color
   */
  #shapeThumb(shape, color) {
    const stroke = `fill="none" stroke="${color}" stroke-width="4"`;
    const body =
      shape === 'circle'
        ? `<circle cx="32" cy="32" r="20" ${stroke}/>`
        : shape === 'triangle'
          ? `<path d="M32 12 L52 48 L12 48 Z" ${stroke}/>`
          : shape === 'hexagon'
            ? `<path d="M32 12 L49 22 L49 42 L32 52 L15 42 L15 22 Z" ${stroke}/>`
            : shape === 'line'
              ? `<path d="M12 32 L52 32" ${stroke}/>`
              : `<rect x="14" y="14" width="36" height="36" rx="2" ${stroke}/>`;
    return svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`);
  }

  /**
   * Resolve live Fabric objects for a list of layer ids.
   * @param {string[]} layerIds
   * @returns {import('fabric').FabricObject[]}
   */
  objectsForLayers(layerIds) {
    return layerIds.map((id) => objects.get(id)).filter(Boolean);
  }

  /**
   * Select several objects at once.
   * @param {import('fabric').FabricObject[]} list
   */
  selectObjects(list) {
    if (!list.length) return;
    this.canvas.discardActiveObject();
    if (list.length === 1) {
      this.canvas.setActiveObject(list[0]);
    } else {
      this.canvas.setActiveObject(new ActiveSelection(list, { canvas: this.canvas }));
    }
    this.canvas.requestRenderAll();
  }

  /** Expose the Fabric canvas for advanced panels. */
  get raw() {
    return this.canvas;
  }
}

/**
 * Convenience factory.
 * @param {HTMLCanvasElement} el
 * @param {object} hooks
 */
export const createEngine = (el, hooks) => new CanvasEngine(el, hooks);

export { SWATCHES };
