/**
 * @file src/renderer/components/Inspector.jsx
 * @description Right sidebar — context-sensitive property editing.
 *
 * Three modes:
 *   1. **Nothing selected** → artboard & document settings (size, background,
 *      grid), plus the project metadata used on export.
 *   2. **Layer selected**   → transform, appearance, and a kind-specific block:
 *      `symbol` → material finishes; `text` → typography + arc + shadow;
 *      `shape` → fill/stroke.
 *
 * Every control writes through the engine for anything Fabric owns, and through
 * the store for metadata. Slider drags are marked `transient` so a single
 * history entry is created per gesture (see `onCommit`).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDesignStore } from '../store/useDesignStore';
import { FINISHES, getFinish, finishToCss } from '../lib/finishes';
import { FONT_CHOICES, DEFAULT_TEXT, textPreviewSvg } from '../canvas/text';
import {
  Section,
  Slider,
  NumberField,
  ColorField,
  Select,
  Segmented,
  Row,
  Switch,
  EmptyState,
} from './ui/Controls';
import { IconAlign, IconSparkle, IconLayers, IconMoon } from './ui/Icons';

/**
 * @param {{engineRef: React.MutableRefObject<any>}} props
 */
export function Inspector({ engineRef }) {
  const layers = useDesignStore((s) => s.doc.layers);
  const selection = useDesignStore((s) => s.selection);
  const artboard = useDesignStore((s) => s.doc.artboard);
  const meta = useDesignStore((s) => s.doc.meta);

  const active = useMemo(() => {
    const id = selection[selection.length - 1];
    return layers.find((l) => l.id === id) || null;
  }, [layers, selection]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="panel-header">
        <span className="flex items-center gap-1.5">
          <IconLayers size={12} className="text-gold-400/70" />
          {active ? 'Properties' : 'Document'}
        </span>
        {selection.length > 1 && <span className="chip">{selection.length} selected</span>}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {active ? <LayerProperties layer={active} engineRef={engineRef} /> : <DocumentProperties artboard={artboard} meta={meta} />}
      </div>
    </div>
  );
}

/* ══════════════════════════ document mode ══════════════════════════════ */

/**
 * Artboard + project settings shown when nothing is selected.
 * @param {{artboard: object, meta: object}} props
 */
function DocumentProperties({ artboard, meta }) {
  const setArtboard = useDesignStore((s) => s.setArtboard);
  const setMeta = useDesignStore((s) => s.setMeta);

  const SIZES = [
    { label: 'Square 1200', w: 1200, h: 1200 },
    { label: 'Square 2000', w: 2000, h: 2000 },
    { label: 'Portrait 1200×1600', w: 1200, h: 1600 },
    { label: 'Landscape 1600×900', w: 1600, h: 900 },
    { label: 'Badge 900×900', w: 900, h: 900 },
    { label: 'Banner 2400×800', w: 2400, h: 800 },
  ];

  return (
    <>
      <Section title="Artboard">
        <Select
          label="Preset"
          value={`${artboard.width}x${artboard.height}`}
          options={[
            // "Custom" is only offered when the artboard is not a preset, which
            // also keeps option values unique for React.
            ...(SIZES.some((s) => s.w === artboard.width && s.h === artboard.height)
              ? []
              : [{ value: 'custom', label: 'Custom size' }]),
            ...SIZES.map((s) => ({ value: `${s.w}x${s.h}`, label: s.label })),
          ]}
          onChange={(v) => {
            if (v === 'custom') return;
            const [w, h] = v.split('x').map(Number);
            setArtboard({ width: w, height: h });
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Width"
            value={artboard.width}
            min={200}
            max={8000}
            onChange={(v) => setArtboard({ width: v })}
            unit="px"
          />
          <NumberField
            label="Height"
            value={artboard.height}
            min={200}
            max={8000}
            onChange={(v) => setArtboard({ height: v })}
            unit="px"
          />
        </div>
        <ColorField label="Background" value={artboard.background} onChange={(v) => setArtboard({ background: v })} />
        <Row label="Backdrop presets">
          <div className="flex flex-wrap gap-1">
            {[
              ['#0d0c12', 'Void'],
              ['#16110a', 'Umber'],
              ['#efe3c6', 'Parchment'],
              ['#0a0f0c', 'Deep Moss'],
              ['#130a0a', 'Dried Blood'],
              ['#f7f5ef', 'Bone'],
            ].map(([c, name]) => (
              <button
                key={c}
                type="button"
                title={name}
                onClick={() => setArtboard({ background: c })}
                className="w-6 h-6 rounded-full border border-white/15 hover:border-gold-300 transition-colors"
                style={{ background: c }}
              />
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Project" defaultOpen>
        <Row label="Name">
          <input
            className="field"
            value={meta.name}
            onChange={(e) => setMeta({ name: e.target.value })}
            placeholder="Untitled Sigil"
          />
        </Row>
        <Row label="Author">
          <input
            className="field"
            value={meta.author}
            onChange={(e) => setMeta({ author: e.target.value })}
            placeholder="Your name or coven"
          />
        </Row>
        <Row label="Description">
          <textarea
            className="field h-16 py-1 resize-none leading-snug"
            value={meta.description}
            onChange={(e) => setMeta({ description: e.target.value })}
            placeholder="Intention, dedication, notes…"
          />
        </Row>
        <Row label="Tags" hint="Comma separated. Used for search and templates.">
          <input
            className="field"
            value={(meta.tags || []).join(', ')}
            onChange={(e) =>
              setMeta({
                tags: e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
            placeholder="celtic, lunar, protection"
          />
        </Row>
      </Section>

      <div className="p-3">
        <div className="rounded-lg border border-gold-400/15 bg-gold-400/[0.04] p-3">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-gold-300/80 mb-1">
            <IconSparkle size={11} /> Nothing selected
          </p>
          <p className="text-[10px] leading-relaxed text-neutral-500">
            Select a layer on the canvas or in the layer stack to edit its material, typography and transforms.
          </p>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════ layer mode ═══════════════════════════════ */

/**
 * Properties for a single selected layer.
 * @param {{layer: import('../canvas/engine').LayerMeta, engineRef: React.MutableRefObject<any>}} props
 */
function LayerProperties({ layer, engineRef }) {
  const patchLayer = useDesignStore((s) => s.patchLayer);
  const selection = useDesignStore((s) => s.selection);

  /** Update layer metadata + push to the Fabric object. */
  const apply = useCallback(
    (patch, opts = {}) => {
      patchLayer(layer.id, patch, opts);
      engineRef.current?.applyLayerProps(layer.id, patch);
    },
    [engineRef, layer.id, patchLayer],
  );

  return (
    <>
      <Section title={layer.name} defaultOpen>
        <Row label="Layer name">
          <input
            className="field"
            value={layer.name}
            onChange={(e) => patchLayer(layer.id, { name: e.target.value }, { history: false })}
          />
        </Row>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">Visible</span>
          <Switch
            checked={layer.visible !== false}
            onChange={(v) => apply({ visible: v })}
            label="Toggle visibility"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">Locked</span>
          <Switch checked={!!layer.locked} onChange={(v) => apply({ locked: v })} label="Toggle lock" />
        </div>
        <Slider
          label="Opacity"
          value={layer.opacity ?? 1}
          min={0}
          max={1}
          step={0.01}
          unit="%"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => apply({ opacity: v }, { history: false })}
          onCommit={() => useDesignStore.getState().checkpoint()}
        />
      </Section>

      {(layer.kind === 'symbol' || layer.kind === 'background') && (
        <SymbolProperties layer={layer} engineRef={engineRef} />
      )}
      {layer.kind === 'text' && <TextProperties layer={layer} engineRef={engineRef} />}
      {layer.kind === 'shape' && <ShapeProperties layer={layer} />}
      {layer.kind === 'image' && <ImageProperties layer={layer} />}

      <Section title="Transform" defaultOpen={false}>
        <TransformPanel layer={layer} engineRef={engineRef} />
      </Section>

      <Section title="Arrange" defaultOpen={false}>
        <Row label="Align to artboard">
          <div className="grid grid-cols-3 gap-1">
            {[
              ['top', 'Top'],
              ['center-v', 'Middle'],
              ['bottom', 'Bottom'],
              ['left', 'Left'],
              ['center-h', 'Centre'],
              ['right', 'Right'],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className="btn btn-icon !w-full !h-6 text-[9px]"
                title={label}
                onClick={() => engineRef.current?.alignSelection(mode)}
              >
                <IconAlign mode={mode} size={11} />
              </button>
            ))}
          </div>
        </Row>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className="btn" onClick={() => engineRef.current?.reorderLayer(layer.id, 'front')}>
            To front
          </button>
          <button type="button" className="btn" onClick={() => engineRef.current?.reorderLayer(layer.id, 'back')}>
            To back
          </button>
        </div>
      </Section>

      <div className="p-3 flex gap-1.5">
        <button
          type="button"
          className="btn flex-1"
          onClick={() => engineRef.current?.duplicateLayers(selection)}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="btn flex-1 hover:!text-blood-500 hover:!border-blood-500/40"
          onClick={() => engineRef.current?.removeLayers(selection)}
        >
          Delete
        </button>
      </div>
    </>
  );
}

/* ──────────────────────────── symbol ──────────────────────────── */

/**
 * Material finish picker for vector symbols — the signature feature.
 * @param {{layer: object, engineRef: React.MutableRefObject<any>}} props
 */
function SymbolProperties({ layer, engineRef }) {
  const patchLayer = useDesignStore((s) => s.patchLayer);
  const checkpoint = useDesignStore((s) => s.checkpoint);

  /** Group finishes by their `group` label for the picker. */
  const grouped = useMemo(() => {
    const map = new Map();
    FINISHES.forEach((f) => {
      if (!map.has(f.group)) map.set(f.group, []);
      map.get(f.group).push(f);
    });
    return [...map.entries()];
  }, []);

  const choose = async (finishId) => {
    checkpoint();
    patchLayer(layer.id, { finishId }, { history: false });
    await engineRef.current?.restyleSymbol(layer.id, finishId, layer);
  };

  return (
    <Section title="Material Finish">
      <div className="space-y-2.5">
        {grouped.map(([group, list]) => (
          <div key={group}>
            <p className="text-[9px] uppercase tracking-[0.16em] text-neutral-600 mb-1">{group}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {list.map((finish) => {
                const active = (layer.finishId || 'gold') === finish.id;
                return (
                  <button
                    key={finish.id}
                    type="button"
                    onClick={() => choose(finish.id)}
                    title={finish.label}
                    className={`group relative flex items-center gap-1.5 rounded-md border px-1.5 h-8
                      transition-all text-left
                      ${
                        active
                          ? 'border-gold-400/60 bg-gold-400/10 shadow-glow'
                          : 'border-white/[0.06] bg-void-900/50 hover:border-gold-400/30'
                      }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full shrink-0 border border-black/40 shadow-inner"
                      style={{ background: finishToCss(finish.id, 135) }}
                    />
                    <span
                      className={`text-[10px] truncate ${active ? 'text-parchment' : 'text-neutral-400'}`}
                    >
                      {finish.label.replace('Alchemical ', '')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[9px] leading-relaxed text-neutral-600 pt-1">
        Finishes repaint the vector artwork — exports stay crisp at any size.
      </p>
      <button
        type="button"
        className="btn w-full"
        onClick={() => engineRef.current?.alignSelection('center')}
        title="Centre this symbol on the artboard"
      >
        Centre on artboard
      </button>
    </Section>
  );
}

/* ───────────────────────────── text ───────────────────────────── */

/**
 * Typography controls, including the text-on-arc slider.
 * @param {{layer: object, engineRef: React.MutableRefObject<any>}} props
 */
function TextProperties({ layer, engineRef }) {
  const patchLayer = useDesignStore((s) => s.patchLayer);
  const checkpoint = useDesignStore((s) => s.checkpoint);
  const cfg = { ...DEFAULT_TEXT, ...(layer.text || {}) };

  /** Debounced-ish style update: transient during drag, committed on release. */
  const update = (patch, transient = true) => {
    const next = { ...cfg, ...patch };
    engineRef.current?.updateTextStyle(layer.id, patch, { ...layer, text: next }, { transient });
  };

  const commit = () => checkpoint();

  return (
    <>
      <Section title="Typography">
        {/* Live specimen */}
        <div
          className="rounded-md border border-white/[0.07] bg-void-900/70 overflow-hidden"
          dangerouslySetInnerHTML={{
            __html: textPreviewSvg(cfg, { width: 260, height: 78 }).replace(
              '<svg ',
              '<svg style="width:100%;height:auto;display:block" ',
            ),
          }}
        />

        <Row label="Content">
          <textarea
            className="field h-14 py-1 resize-none leading-snug font-serif text-[13px]"
            value={cfg.text}
            onChange={(e) => update({ text: e.target.value })}
            onBlur={commit}
            placeholder="Inscribe your words…"
          />
        </Row>

        <Select
          label="Typeface"
          value={cfg.fontFamily}
          options={FONT_CHOICES.map((f) => ({ value: f.value, label: `${f.label} — ${f.note}` }))}
          onChange={(v) => {
            update({ fontFamily: v });
            commit();
          }}
        />

        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Size"
            value={cfg.fontSize}
            min={8}
            max={400}
            onChange={(v) => update({ fontSize: v })}
            onCommit={commit}
            unit="px"
          />
          <Select
            label="Weight"
            value={cfg.fontWeight}
            options={[
              { value: '300', label: 'Light' },
              { value: '400', label: 'Regular' },
              { value: '600', label: 'Semibold' },
              { value: '700', label: 'Bold' },
              { value: '900', label: 'Black' },
            ]}
            onChange={(v) => {
              update({ fontWeight: v });
              commit();
            }}
          />
        </div>

        <Slider
          label="Letter spacing"
          value={cfg.letterSpacing}
          min={-20}
          max={60}
          step={0.5}
          onChange={(v) => update({ letterSpacing: v })}
          onCommit={commit}
          unit="px"
        />

        <Slider
          label="Line height"
          value={cfg.lineHeight}
          min={0.7}
          max={2.4}
          step={0.02}
          onChange={(v) => update({ lineHeight: v })}
          onCommit={commit}
          format={(v) => v.toFixed(2)}
        />

        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">All caps</span>
          <Switch
            checked={cfg.uppercase}
            onChange={(v) => {
              update({ uppercase: v });
              commit();
            }}
            label="Uppercase"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">Italic</span>
          <Switch
            checked={cfg.italic}
            onChange={(v) => {
              update({ italic: v });
              commit();
            }}
            label="Italic"
          />
        </div>
      </Section>

      <Section title="Text on Arc">
        <Slider
          label="Curve"
          value={cfg.curve}
          min={0}
          max={360}
          step={1}
          onChange={(v) => update({ curve: v })}
          onCommit={commit}
          format={(v) => (v === 0 ? 'flat' : `${Math.round(v)}°`)}
        />
        <div className="flex gap-1">
          {[0, 90, 180, 270, 360].map((deg) => (
            <button
              key={deg}
              type="button"
              className={`btn flex-1 ${cfg.curve === deg ? 'btn-active' : ''}`}
              onClick={() => {
                update({ curve: deg });
                commit();
              }}
            >
              {deg === 0 ? 'Flat' : `${deg}°`}
            </button>
          ))}
        </div>
        <p className="text-[9px] leading-relaxed text-neutral-600">
          Wrap the inscription around a circle — 180° reads as a full seal, 360° closes the ring.
        </p>
      </Section>

      <Section title="Ink & Shadow">
        <ColorField
          label="Ink colour"
          value={cfg.fill}
          onChange={(v) => update({ fill: v })}
          onCommit={commit}
        />
        <Slider
          label="Drop shadow"
          value={cfg.shadowDepth}
          min={0}
          max={40}
          step={1}
          onChange={(v) => update({ shadowDepth: v })}
          onCommit={commit}
          unit="px"
        />
        {cfg.shadowDepth > 0 && (
          <ColorField
            label="Shadow colour"
            value={cfg.shadowColor.startsWith('#') ? cfg.shadowColor : '#000000'}
            onChange={(v) => update({ shadowColor: v })}
            onCommit={commit}
          />
        )}
      </Section>
    </>
  );
}

/* ───────────────────────────── shapes ─────────────────────────── */

/**
 * Fill/stroke controls for primitive shapes.
 * @param {{layer: object}} props
 */
function ShapeProperties({ layer }) {
  const patchLayer = useDesignStore((s) => s.patchLayer);
  const checkpoint = useDesignStore((s) => s.checkpoint);

  return (
    <Section title="Shape">
      <ColorField
        label="Stroke"
        value={layer.color || '#d4af4f'}
        onChange={(v) => patchLayer(layer.id, { color: v }, { history: false })}
        onCommit={checkpoint}
      />
      <p className="text-[9px] leading-relaxed text-neutral-600">
        Shapes are live vector primitives — scale them freely without loss.
      </p>
    </Section>
  );
}

/**
 * Raster image adjustments.
 * @param {{layer: object}} props
 */
function ImageProperties({ layer }) {
  return (
    <Section title="Image">
      <div className="rounded-md overflow-hidden border border-white/[0.07] bg-void-900/60 aspect-square grid place-items-center">
        {layer.thumb && <img src={layer.thumb} alt="" className="max-w-full max-h-full object-contain" />}
      </div>
      <p className="text-[9px] leading-relaxed text-neutral-600">
        Raster imports keep their original resolution. Use high-DPI sources for print export.
      </p>
    </Section>
  );
}

/* ──────────────────────────── transform ───────────────────────── */

/**
 * Numeric transform controls. Reads the live transform metadata the engine
 * writes back after every move/resize/rotate, and writes through the engine.
 * @param {{layer: object, engineRef: React.MutableRefObject<any>}} props
 */
function TransformPanel({ layer, engineRef }) {
  const checkpoint = useDesignStore((s) => s.checkpoint);
  const t = layer.transform || {};

  /** Push a geometry patch to the Fabric object. */
  const set = (patch, commit = true) => {
    engineRef.current?.setObjectGeometry(layer.id, patch, { history: commit });
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="X"
          value={Math.round(t.left ?? 0)}
          onChange={(v) => set({ left: v }, false)}
          onCommit={checkpoint}
          unit="px"
        />
        <NumberField
          label="Y"
          value={Math.round(t.top ?? 0)}
          onChange={(v) => set({ top: v }, false)}
          onCommit={checkpoint}
          unit="px"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Width" value={Math.round(t.width ?? 0)} onChange={() => {}} disabled unit="px" />
        <NumberField label="Height" value={Math.round(t.height ?? 0)} onChange={() => {}} disabled unit="px" />
      </div>
      <Slider
        label="Rotation"
        value={t.angle ?? 0}
        min={0}
        max={360}
        step={1}
        onChange={(v) => set({ angle: v }, false)}
        onCommit={checkpoint}
        format={(v) => `${Math.round(v)}°`}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" className="btn" onClick={() => set({ scaleX: 1, scaleY: 1 })}>
          Reset scale
        </button>
        <button type="button" className="btn" onClick={() => set({ angle: 0 })}>
          Reset rotation
        </button>
      </div>
    </>
  );
}
