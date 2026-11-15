/**
 * @file src/renderer/App.jsx
 * @description Application shell. Owns:
 *
 *   • the engine lifecycle (create on mount, destroy on unmount),
 *   • the two-way wiring between the engine and the Zustand store,
 *   • the command router — every native menu command and keyboard shortcut
 *     lands in `runCommand()`,
 *   • panel layout (Vault | Stage | Inspector) and modal orchestration.
 *
 * Copilot: add a feature by (1) adding a `case` to {@link runCommand},
 * (2) optionally adding a menu item in `src/main/menu.js`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDesignStore } from './store/useDesignStore';
import { createEngine } from './canvas/engine';
import { loadAsset } from './lib/assetLibrary';
import { FONT_CHOICES } from './canvas/text';
import { saveProject, openProject, exportRaster } from './lib/exporters';
import { TitleBar } from './components/TitleBar';
import { Vault } from './components/Vault';
import { CanvasStage } from './components/CanvasStage';
import { Inspector } from './components/Inspector';
import { LayerPanel } from './components/LayerPanel';
import { StatusBar } from './components/StatusBar';
import { Toasts } from './components/Toasts';
import { ExportModal } from './components/modals/ExportModal';
import { AboutModal } from './components/modals/AboutModal';
import { ShortcutsModal } from './components/modals/ShortcutsModal';
import { TemplatesModal } from './components/modals/TemplatesModal';
import { applyTemplate } from './lib/applyTemplate';

/** Panel width bounds (px). */
const PANEL = { min: 216, max: 420, default: 264 };

export default function App() {
  const engineRef = useRef(null);
  const canvasHosted = useRef(false);

  const [vaultWidth, setVaultWidth] = useState(PANEL.default);
  const [inspectorWidth, setInspectorWidth] = useState(PANEL.default + 36);

  const ui = useDesignStore((s) => s.ui);
  const setUi = useDesignStore((s) => s.setUi);
  const toast = useDesignStore((s) => s.toast);
  // `historyTick` changes whenever the undo/redo stacks change; reading the
  // stacks in the same render keeps the toolbar buttons in sync.
  const historyTick = useDesignStore((s) => s.historyTick);
  const { canUndo, canRedo } = useMemo(
    () => ({
      canUndo: useDesignStore.getState().canUndo(),
      canRedo: useDesignStore.getState().canRedo(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [historyTick],
  );

  /* ═════════════════════ engine bootstrap ═════════════════════ */

  /**
   * Create the engine once, after the canvas element is mounted, and feed its
   * outputs back into the store.
   */
  const ensureEngine = useCallback((el) => {
    if (canvasHosted.current || !el) return engineRef.current;

    const engine = createEngine(
      el,
      {
        onLayers: (layers, opts) => useDesignStore.getState().setLayers(layers, opts),
        onSelection: (ids) => useDesignStore.getState().setSelection(ids),
        // Transforms are mirrored into a separate slice so the inspector can
        // refresh without re-rendering the layer list.
        onTransform: (layers) => {
          useDesignStore.setState({
            doc: { ...useDesignStore.getState().doc, layers },
          });
        },
        onViewport: ({ zoom }) => {
          const current = useDesignStore.getState().ui.zoom;
          if (Math.abs(current - zoom) > 0.001) useDesignStore.getState().setUi({ zoom });
        },
      },
      { fonts: FONT_CHOICES.map((f) => f.value) },
    );
    engineRef.current = engine;
    canvasHosted.current = true;
    engine.warmFonts();

    // Fit the artboard to the host once we know its size.
    const host = document.querySelector('.canvas-stage');
    if (host) {
      const rect = host.getBoundingClientRect();
      const { artboard } = useDesignStore.getState().doc;
      engine.setArtboard(artboard, { width: rect.width, height: rect.height });
    }
    return engine;
  }, []);

  /** Called by CanvasStage once the <canvas> element exists in the DOM. */
  const handleCanvasReady = useCallback(
    (el) => {
      if (canvasHosted.current || !el) return;
      ensureEngine(el);
    },
    [ensureEngine],
  );

  useEffect(
    () => () => {
      engineRef.current?.destroy();
      engineRef.current = null;
      canvasHosted.current = false;
    },
    [],
  );

  /**
   * Keep the artboard in sync when document settings change (size or
   * background). We compare against the engine's copy to avoid re-fitting on
   * every unrelated document mutation.
   */
  const artboard = useDesignStore((s) => s.doc.artboard);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const same =
      engine.artboard.width === artboard.width &&
      engine.artboard.height === artboard.height &&
      engine.artboard.background === artboard.background;
    if (same) return;

    const host = document.querySelector('.canvas-stage');
    if (!host) return;
    const rect = host.getBoundingClientRect();
    engine.setArtboard(artboard, { width: rect.width, height: rect.height });
    engine.setZoom(engine.userZoom);
  }, [artboard]);

  /* ══════════════════════ asset placement ═════════════════════ */

  /**
   * Resolve an asset (or custom import) and place it on the canvas.
   * @param {{id: string, name: string, svg?: string, kind?: string, dataUrl?: string}} item
   * @param {{x?: number, y?: number}} [point]
   */
  const placeAsset = useCallback(
    async (item, point) => {
      const engine = engineRef.current;
      if (!engine) return;
      try {
        if (item.kind === 'raster' && item.dataUrl) {
          await engine.addImage(item.dataUrl, item.name);
          toast(`${item.name} placed`, 'ok');
          return;
        }
        const asset = item.svg ? item : await loadAsset(item);
        const finish = useDesignStore.getState().ui.vaultFinish || 'gold';
        // Textures and gradient washes are placed as full-bleed backgrounds;
        // everything else lands where the user released the drop.
        const asBackground = asset.category === 'textures';
        if (asBackground && !point) {
          await engine.addSymbol(asset, finish, { asBackground: true });
          toast(`${asset.name} set as backdrop`, 'ok');
          return;
        }
        await engine.addSymbol(
          asset,
          finish,
          point ? { left: point.x, top: point.y } : { asBackground },
        );
        toast(`${asset.name} added`, 'ok');
      } catch (err) {
        toast(`Could not place asset: ${err.message}`, 'error');
      }
    },
    [toast],
  );

  /* ══════════════════════════ commands ════════════════════════ */

  /**
   * Central command router. Every menu item / shortcut maps to one case.
   * @param {string} command
   * @param {*} [payload]
   */
  const runCommand = useCallback(
    async (command, payload) => {
      const engine = engineRef.current;
      const state = useDesignStore.getState();
      const { selection, doc, ui: uiState } = state;

      switch (command) {
        /* ── document ─────────────────────────────────────────── */
        case 'new-project': {
          if (state.ui.dirty) {
            const proceed = window.confirm(
              'Discard unsaved changes and start a new project?\n\nThis cannot be undone.',
            );
            if (!proceed) return;
          }
          engine?.raw.clear();
          engine?.raw.renderAll();
          state.resetAll();
          state.toast('New canvas ready', 'ok');
          break;
        }

        case 'save-project':
        case 'save-project-as':
        case 'save-template': {
          const result = await saveProject(
            engine,
            { artboard: doc.artboard, meta: doc.meta },
            { filePath: state.ui.filePath, saveAs: command !== 'save-project' },
          );
          if (result?.canceled) return;
          if (result?.error) return state.toast(`Save failed: ${result.error}`, 'error');
          state.markSaved(result.filePath, result.name);
          state.toast(command === 'save-template' ? 'Template saved' : 'Project saved', 'ok');
          break;
        }

        case 'open-project': {
          const result = await openProject();
          if (result?.canceled) return;
          if (result?.error) return state.toast(`Could not open: ${result.error}`, 'error');
          await engine?.loadDocument(result.project, {
            width: document.querySelector('.canvas-stage')?.clientWidth || 1200,
            height: document.querySelector('.canvas-stage')?.clientHeight || 800,
          });
          state.loadDocument(result.project, { filePath: result.filePath, name: result.name });
          state.toast(`Opened ${result.name}`, 'ok');
          break;
        }

        case 'open-recent': {
          if (!payload || !window.desktop?.files?.readProject) return;
          const result = await window.desktop.files.readProject(payload);
          if (result?.error) return state.toast(`Could not open: ${result.error}`, 'error');
          await engine?.loadDocument(result.project, {
            width: document.querySelector('.canvas-stage')?.clientWidth || 1200,
            height: document.querySelector('.canvas-stage')?.clientHeight || 800,
          });
          state.loadDocument(result.project, { filePath: result.filePath, name: result.name });
          break;
        }

        case 'open-export':
          state.setUi({ modal: 'export' });
          break;

        case 'open-templates':
          state.setUi({ modal: 'templates' });
          break;

        case 'quick-export': {
          const result = await exportRaster(engine, {
            format: 'png',
            multiplier: 2,
            projectName: state.ui.projectName,
          });
          if (result?.error) state.toast(`Export failed: ${result.error}`, 'error');
          else if (!result?.canceled) state.toast('Exported PNG @2×', 'ok');
          break;
        }

        /* ── history ──────────────────────────────────────────── */
        case 'undo':
          if (!state.undo()) state.toast('Nothing to undo', 'info');
          break;
        case 'redo':
          if (!state.redo()) state.toast('Nothing to redo', 'info');
          break;

        /* ── editing ──────────────────────────────────────────── */
        case 'copy':
          await engine?.copySelection();
          state.toast('Copied', 'ok');
          break;
        case 'cut':
          await engine?.copySelection();
          engine?.removeLayers(selection);
          break;
        case 'paste':
          await engine?.paste();
          break;
        case 'duplicate':
          await engine?.duplicateLayers(selection);
          break;
        case 'delete':
          engine?.removeLayers(selection);
          break;
        case 'select-all':
          engine?.selectAll();
          break;
        case 'deselect':
          engine?.deselect();
          break;
        case 'group':
          await engine?.groupSelection();
          break;
        case 'ungroup':
          engine?.ungroupSelection();
          break;
        case 'bring-front':
          selection.forEach((id) => engine?.reorderLayer(id, 'front'));
          break;
        case 'send-back':
          selection.forEach((id) => engine?.reorderLayer(id, 'back'));
          break;
        case 'toggle-lock':
          selection.forEach((id) => {
            const layer = state.doc.layers.find((l) => l.id === id);
            if (layer) {
              state.patchLayer(id, { locked: !layer.locked });
              engine?.applyLayerProps(id, { locked: !layer.locked });
            }
          });
          break;

        /* ── view ─────────────────────────────────────────────── */
        case 'zoom-in':
          engine?.zoomBy(1.2);
          break;
        case 'zoom-out':
          engine?.zoomBy(1 / 1.2);
          break;
        case 'zoom-fit':
          engine?.zoomFit();
          break;
        case 'zoom-100':
          engine?.setZoom(1 / (engine?.fitScale || 1));
          break;
        case 'toggle-grid':
          state.setUi({ showGrid: !uiState.showGrid });
          break;
        case 'toggle-snap':
          state.setUi({ snapToGrid: !uiState.snapToGrid });
          break;
        case 'toggle-rulers':
          state.setUi({ showRulers: !uiState.showRulers });
          break;
        case 'toggle-vault':
          state.setUi({ showVault: !uiState.showVault });
          break;
        case 'toggle-inspector':
          state.setUi({ showInspector: !uiState.showInspector });
          break;

        /* ── help / modals ────────────────────────────────────── */
        case 'open-about':
        case 'open-guide':
          state.setUi({ modal: 'about' });
          break;
        case 'open-shortcuts':
          state.setUi({ modal: 'shortcuts' });
          break;
        case 'open-vault-folder':
          window.desktop?.shell?.openVaultFolder();
          break;
        default:
          break;
      }
    },
    [toast],
  );

  /* ── native menu bridge ─────────────────────────────────────── */
  useEffect(() => {
    if (!window.desktop?.onMenuCommand) return undefined;
    return window.desktop.onMenuCommand(({ command, payload }) => runCommand(command, payload));
  }, [runCommand]);

  /* ── global keyboard shortcuts (browser fallback + canvas keys) ── */
  useEffect(() => {
    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        runCommand(e.shiftKey ? 'redo' : 'undo');
      } else if (mod && key === 'y') {
        e.preventDefault();
        runCommand('redo');
      } else if (mod && key === 'd') {
        e.preventDefault();
        runCommand('duplicate');
      } else if (mod && key === 'a') {
        e.preventDefault();
        runCommand('select-all');
      } else if (mod && key === 'g') {
        e.preventDefault();
        runCommand(e.shiftKey ? 'ungroup' : 'group');
      } else if (mod && key === 'e') {
        e.preventDefault();
        runCommand(e.shiftKey ? 'quick-export' : 'open-export');
      } else if (mod && key === 'b') {
        e.preventDefault();
        runCommand('toggle-vault');
      } else if (mod && (key === '=' || key === '+')) {
        e.preventDefault();
        runCommand('zoom-in');
      } else if (mod && key === '-') {
        e.preventDefault();
        runCommand('zoom-out');
      } else if (mod && key === '0') {
        e.preventDefault();
        runCommand('zoom-fit');
      } else if (key === 'delete' || key === 'backspace') {
        if (useDesignStore.getState().selection.length) {
          e.preventDefault();
          runCommand('delete');
        }
      } else if (key === 'escape') {
        runCommand('deselect');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runCommand]);

  /* ══════════════════════ layer callbacks ═════════════════════ */

  /** Select a layer on the canvas from the layer panel. */
  const selectLayer = useCallback((id, additive) => {
    const engine = engineRef.current;
    const current = useDesignStore.getState().selection;
    const next = additive
      ? current.includes(id)
        ? current.filter((s) => s !== id)
        : [...current, id]
      : [id];

    useDesignStore.getState().setSelection(next);
    if (!engine) return;

    // Map layer ids → live Fabric objects. Fabric stamps `plmLayerId` during
    // serialisation only, so fall back to the engine's own reverse map.
    const targets = engine.objectsForLayers(next);
    if (targets.length === 1) engine.raw.setActiveObject(targets[0]);
    else if (targets.length > 1) engine.selectObjects(targets);
    else engine.raw.discardActiveObject();
    engine.raw.requestRenderAll();
  }, []);

  /** Patch layer props from the panel (visibility/lock/name). */
  const layerProps = useCallback((id, patch) => {
    useDesignStore.getState().patchLayer(id, patch);
    engineRef.current?.applyLayerProps(id, patch);
  }, []);

  /** Reorder from the layer panel (drag or buttons). */
  const reorder = useCallback((id, target) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (typeof target === 'number') engine.moveLayerToIndex(id, target);
    else engine.reorderLayer(id, target);
  }, []);

  /**
   * Instantiate a template: load its artboard, replay its layers, and reset the
   * document metadata + history so the result is a clean project.
   */
  const pickTemplate = useCallback(
    async (template) => {
      const engine = engineRef.current;
      if (!engine) return;
      const state = useDesignStore.getState();
      if (state.doc.layers.length && state.ui.dirty) {
        const proceed = window.confirm('Replace the current design with this template?');
        if (!proceed) return;
      }

      engine.raw.clear();
      engine.currentMeta = [];
      engine.raw.backgroundColor = template.artboard.background;
      state.resetAll();

      const host = document.querySelector('.canvas-stage');
      const viewport = {
        width: host?.clientWidth || 1200,
        height: host?.clientHeight || 800,
      };

      try {
        const { placed, missing } = await applyTemplate(engine, template, { viewport });
        state.setArtboard(template.artboard);
        state.setMeta({ name: template.name, tags: template.tags });
        state.setUi({ projectName: template.name, modal: null, dirty: false });
        if (missing.length) {
          state.toast(`Loaded ${template.name} (${missing.length} asset(s) unavailable)`, 'info');
        } else {
          state.toast(`Loaded ${template.name} — ${placed} layers`, 'ok');
        }
      } catch (err) {
        state.toast(`Could not load template: ${err.message}`, 'error');
      }
    },
    [],
  );

  /* ══════════════════════ custom imports ══════════════════════ */

  const [customAssets, setCustomAssets] = useState([]);

  /** Import one or more files into the custom vault section. */
  const importAssets = useCallback(async () => {
    if (window.desktop?.files?.importAsset) {
      const result = await window.desktop.files.importAsset();
      if (result?.canceled || !result?.items?.length) return;

      const added = [];
      for (const item of result.items) {
        if (item.kind === 'error') {
          toast(`Could not import ${item.name}`, 'error');
          continue;
        }
        if (item.kind === 'svg') {
          added.push({
            id: `custom-${Date.now()}-${added.length}`,
            name: item.name,
            kind: 'svg',
            thumbSvg: item.contents,
            svg: item.contents,
            curated: false,
          });
        } else {
          added.push({
            id: `custom-${Date.now()}-${added.length}`,
            name: item.name,
            kind: 'raster',
            dataUrl: item.dataUrl,
            curated: false,
          });
        }
      }
      setCustomAssets((prev) => [...added, ...prev]);
      if (added.length) toast(`Imported ${added.length} asset${added.length > 1 ? 's' : ''}`, 'ok');
      return;
    }

    // Browser fallback: hidden file input.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,.png,.jpg,.jpeg,.webp';
    input.multiple = true;
    input.onchange = async () => {
      const files = [...(input.files || [])];
      const added = [];
      for (const file of files) {
        if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
          const text = await file.text();
          added.push({
            id: `custom-${Date.now()}-${added.length}`,
            name: file.name.replace(/\.svg$/i, ''),
            kind: 'svg',
            thumbSvg: text,
            svg: text,
            curated: false,
          });
        } else {
          const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
          });
          added.push({
            id: `custom-${Date.now()}-${added.length}`,
            name: file.name.replace(/\.[^.]+$/, ''),
            kind: 'raster',
            dataUrl,
            curated: false,
          });
        }
      }
      setCustomAssets((prev) => [...added, ...prev]);
      if (added.length) toast(`Imported ${added.length} asset${added.length > 1 ? 's' : ''}`, 'ok');
    };
    input.click();
  }, [toast]);

  /* ══════════════════════ panel resizing ══════════════════════ */

  /**
   * Start a drag-to-resize gesture for a side panel.
   * @param {'left'|'right'} side
   */
  const startResize = (side) => (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'left' ? vaultWidth : inspectorWidth;

    const move = (ev) => {
      const delta = side === 'left' ? ev.clientX - startX : startX - ev.clientX;
      const next = Math.min(PANEL.max, Math.max(PANEL.min, startW + delta));
      if (side === 'left') setVaultWidth(next);
      else setInspectorWidth(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ══════════════════════════ render ══════════════════════════ */

  const modals = useMemo(
    () => ({
      export: <ExportModal onClose={() => setUi({ modal: null })} engineRef={engineRef} />,
      about: <AboutModal onClose={() => setUi({ modal: null })} />,
      shortcuts: <ShortcutsModal onClose={() => setUi({ modal: null })} />,
      templates: <TemplatesModal onClose={() => setUi({ modal: null })} onPick={pickTemplate} />,
    }),
    [setUi, pickTemplate],
  );

  return (
    <div className="flex flex-col h-full">
      <TitleBar
        onNew={() => runCommand('open-templates')}
        onSave={() => runCommand('save-template')}
        onExport={() => runCommand('open-export')}
        onAbout={() => runCommand('open-about')}
        onUndo={() => runCommand('undo')}
        onRedo={() => runCommand('redo')}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <div className="flex flex-1 min-h-0">
        {/* Vault -------------------------------------------------- */}
        {ui.showVault && (
          <>
            <div style={{ width: vaultWidth }} className="shrink-0 panel border-r border-gold-400/10">
              <Vault onAddAsset={placeAsset} onImport={importAssets} customAssets={customAssets} />
            </div>
            <ResizeHandle onPointerDown={startResize('left')} />
          </>
        )}

        {/* Stage -------------------------------------------------- */}
        <CanvasStage engineRef={engineRef} onDropAsset={placeAsset} onReady={handleCanvasReady} />

        {/* Inspector ---------------------------------------------- */}
        {ui.showInspector && (
          <>
            <ResizeHandle onPointerDown={startResize('right')} />
            <div
              style={{ width: inspectorWidth }}
              className="shrink-0 flex flex-col panel border-l border-gold-400/10 min-h-0"
            >
              <div className="flex flex-col min-h-0" style={{ flex: '1 1 55%' }}>
                <Inspector engineRef={engineRef} />
              </div>
              <div className="border-t border-gold-400/15 flex flex-col min-h-0" style={{ flex: '1 1 45%' }}>
                <LayerPanel
                  engineRef={engineRef}
                  onSelectLayer={selectLayer}
                  onLayerProps={layerProps}
                  onDelete={(ids) => engineRef.current?.removeLayers(ids)}
                  onDuplicate={(ids) => engineRef.current?.duplicateLayers(ids)}
                  onReorder={reorder}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <StatusBar />
      <Toasts />
      {ui.modal && modals[ui.modal]}
    </div>
  );
}

/** Draggable divider between panels. @param {{onPointerDown: Function}} props */
function ResizeHandle({ onPointerDown }) {
  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      className="w-[3px] shrink-0 cursor-col-resize bg-transparent hover:bg-gold-400/40 transition-colors"
    />
  );
}
