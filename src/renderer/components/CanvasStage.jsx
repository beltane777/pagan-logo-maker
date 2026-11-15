/**
 * @file src/renderer/components/CanvasStage.jsx
 * @description Center stage — owns the `<canvas>` element, wires it to the
 * Fabric engine, and provides the floating viewport controls (zoom, grid, snap,
 * fit) plus drag-and-drop asset placement.
 *
 * The component is intentionally thin: all drawing lives in
 * {@link module:canvas/engine}. React only manages the element lifecycle, the
 * ResizeObserver, and the drop target.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDesignStore } from '../store/useDesignStore';
import {
  IconZoomIn,
  IconZoomOut,
  IconFit,
  IconGrid,
  IconMagnet,
  IconRulers,
  IconMoon,
} from './ui/Icons';

/**
 * @param {{engineRef: React.MutableRefObject<import('../canvas/engine').CanvasEngine|null>,
 *   onDropAsset: (payload: {id: string, name: string}, point: {x:number,y:number}) => void,
 *   onReady: (el: HTMLCanvasElement) => void}} props
 */
export function CanvasStage({ engineRef, onDropAsset, onReady }) {
  const hostRef = useRef(null);
  const canvasElRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const ui = useDesignStore((s) => s.ui);
  const setUi = useDesignStore((s) => s.setUi);

  /* ── observe the available space (and hand the element to the app) ── */
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) });
    });
    observer.observe(host);

    // The engine needs a mounted <canvas>; signal readiness to the shell.
    onReady(canvasElRef.current);

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Push viewport size changes into the engine (refit + recentre). */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !size.width || !size.height) return;
    const { artboard } = useDesignStore.getState().doc;
    engine.setArtboard(artboard, size);
    // Keep the user's zoom level after a refit.
    engine.setZoom(engine.userZoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  /** Mirror grid/snap settings onto the engine. */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setGridVisible(ui.showGrid);
    engine.setSnapToGrid(ui.snapToGrid);
    engine.setGridSize(ui.gridSize);
  }, [engineRef, ui.showGrid, ui.snapToGrid, ui.gridSize]);

  /* ── space-to-pan ────────────────────────────────────────────────── */
  useEffect(() => {
    const host = hostRef.current;
    const engine = engineRef.current;
    if (!host || !engine) return;

    let panning = false;
    let spaceHeld = false;
    let origin = { x: 0, y: 0, tx: 0, ty: 0 };

    /** Space arms pan mode; it must not fire while typing. */
    const onKeyDown = (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.code === 'Space' && !spaceHeld) {
        spaceHeld = true;
        host.style.cursor = 'grab';
        e.preventDefault();
      }
    };

    const onKeyUp = (e) => {
      if (e.code === 'Space') {
        spaceHeld = false;
        panning = false;
        host.style.cursor = '';
      }
    };

    const onPointerDown = (e) => {
      if (!spaceHeld || e.button !== 0) return;
      panning = true;
      host.style.cursor = 'grabbing';
      const vpt = engine.raw.viewportTransform;
      origin = { x: e.clientX, y: e.clientY, tx: vpt[4], ty: vpt[5] };
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!panning) return;
      const vpt = engine.raw.viewportTransform.slice();
      vpt[4] = origin.tx + (e.clientX - origin.x);
      vpt[5] = origin.ty + (e.clientY - origin.y);
      engine.raw.setViewportTransform(vpt);
      engine.raw.requestRenderAll();
    };

    const onPointerUp = () => {
      if (!panning) return;
      panning = false;
      host.style.cursor = spaceHeld ? 'grab' : '';
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    host.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      host.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    // Re-bind once the engine exists (it is created after first paint).
  }, [engineRef, size.width]);

  /* ── wheel zoom (ctrl/cmd) and pan ───────────────────────────────── */
  useEffect(() => {
    const host = hostRef.current;
    const engine = engineRef.current;
    if (!host || !engine) return;

    /** @param {WheelEvent} e */
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      engine.zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [engineRef]);

  /* ── drag & drop from the vault ──────────────────────────────────── */
  const handleDragOver = useCallback((e) => {
    if (!e.dataTransfer.types.includes('application/x-plm-asset')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const raw = e.dataTransfer.getData('application/x-plm-asset');
      if (!raw) return;
      try {
        const payload = JSON.parse(raw);
        const engine = engineRef.current;
        if (!engine) return;
        // Convert screen → artboard coordinates for precise placement.
        const rect = hostRef.current.getBoundingClientRect();
        const vpt = engine.raw.viewportTransform.slice();
        const scale = vpt[0];
        const x = (e.clientX - rect.left - vpt[4]) / scale;
        const y = (e.clientY - rect.top - vpt[5]) / scale;
        onDropAsset(payload, { x, y });
      } catch {
        /* ignore malformed payloads */
      }
    },
    [engineRef, onDropAsset],
  );

  const zoomPct = Math.round(ui.zoom * 100);

  return (
    <div className="relative flex-1 min-w-0 h-full overflow-hidden canvas-shell">
      {/* Fabric mounts here */}
      <div
        ref={hostRef}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`canvas-stage absolute inset-0 transition-shadow ${dragOver ? 'is-dragover' : ''}`}
      >
        <canvas ref={canvasElRef} />
      </div>

      {/* Drop hint */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-gold-400/50
                        grid place-items-center animate-fade-in">
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold-300/80">Release to place</p>
        </div>
      )}

      {/* Viewport controls ------------------------------------------- */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-1.5 py-1
                      rounded-lg border border-gold-400/15 bg-void-850/90 backdrop-blur-md shadow-panel">
        <IconBtn label="Zoom out" onClick={() => engineRef.current?.zoomBy(1 / 1.15)}>
          <IconZoomOut size={14} />
        </IconBtn>
        <button
          type="button"
          onClick={() => engineRef.current?.zoomFit()}
          title="Fit artboard (⌘0)"
          className="px-1.5 min-w-[48px] text-[10px] font-mono tnum text-gold-200/90 hover:text-gold-100"
        >
          {zoomPct}%
        </button>
        <IconBtn label="Zoom in" onClick={() => engineRef.current?.zoomBy(1.15)}>
          <IconZoomIn size={14} />
        </IconBtn>
        <div className="w-px h-4 bg-white/10 mx-0.5" />
        <IconBtn label="Fit" onClick={() => engineRef.current?.zoomFit()}>
          <IconFit size={14} />
        </IconBtn>
        <IconBtn
          label="Grid"
          active={ui.showGrid}
          onClick={() => setUi({ showGrid: !ui.showGrid })}
        >
          <IconGrid size={14} />
        </IconBtn>
        <IconBtn
          label="Snap to guides"
          active={ui.snapToGrid}
          onClick={() => setUi({ snapToGrid: !ui.snapToGrid })}
        >
          <IconMagnet size={14} />
        </IconBtn>
        <IconBtn
          label="Rulers"
          active={ui.showRulers}
          onClick={() => setUi({ showRulers: !ui.showRulers })}
        >
          <IconRulers size={14} />
        </IconBtn>
      </div>

      {/* Artboard size badge ------------------------------------------ */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5">
        <span className="chip !border-white/10 !text-neutral-500 !bg-void-850/80 backdrop-blur-sm tnum">
          {useDesignStore.getState().doc.artboard.width} × {useDesignStore.getState().doc.artboard.height}
        </span>
        {ui.showRulers && <Rulers />}
      </div>
    </div>
  );
}

/**
 * Compact icon button used in the floating viewport bar.
 * @param {{label: string, onClick: Function, active?: boolean, children: React.ReactNode}} props
 */
function IconBtn({ label, onClick, active, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={!!active}
      className={`btn btn-icon !w-6 !h-6 ${active ? 'btn-active' : 'text-neutral-500'}`}
    >
      {children}
    </button>
  );
}

/**
 * Decorative ruler overlay with tick marks and labels.
 * Renders in screen space; the canvas under it is unscaled by CSS transforms.
 */
function Rulers() {
  const ticks = Array.from({ length: 25 }, (_, i) => i);
  return (
    <>
      <div className="absolute -bottom-2 left-0 right-0 h-4 translate-y-full
                      bg-void-850/80 border-y border-gold-400/10 flex text-[8px] text-neutral-600">
        {ticks.map((i) => (
          <div key={i} className="flex-1 border-r border-white/[0.06] pl-0.5 last:border-0">
            {i % 4 === 0 ? i * 50 : ''}
          </div>
        ))}
      </div>
      <div className="absolute top-0 -right-2 bottom-0 w-4 translate-x-full
                      bg-void-850/80 border-x border-gold-400/10 flex flex-col text-[8px] text-neutral-600">
        {ticks.map((i) => (
          <div key={i} className="flex-1 border-b border-white/[0.06] pt-0.5 last:border-0" />
        ))}
      </div>
    </>
  );
}
