/**
 * @file src/renderer/components/Vault.jsx
 * @description Left sidebar — "The Vault". An offline, categorised browser for
 * the bundled royalty-free vector library plus the user's imported assets.
 *
 * Interactions
 * ────────────
 *   • click a tile        → add to canvas (centred)
 *   • drag a tile         → drop anywhere on the canvas
 *   • ⌥/Alt-click         → add without switching the active tool
 *   • search box          → filters across names + tags (see assetLibrary)
 *
 * Assets are rendered as data-URL `<img>` thumbnails so a folder of 100 SVGs
 * costs no extra DOM nodes.
 *
 * @see ../lib/assetLibrary.js
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDesignStore } from '../store/useDesignStore';
import { getGroups, searchAssets, loadAsset, svgThumb, libraryStats } from '../lib/assetLibrary';
import { getFinish, finishToCss } from '../lib/finishes';
import { IconChevron, IconSearch, IconPlus, IconImport, IconFolder, IconSparkle } from './ui/Icons';
import { EmptyState } from './ui/Controls';

/** Group iconography, keyed by manifest group id. */
const GROUP_ICONS = {
  symbols: IconSparkle,
  frames: IconPlus,
  textures: IconFolder,
  custom: IconImport,
};

/**
 * @param {{onAddAsset: (item: object) => void, onImport: () => void, customAssets: object[]}} props
 */
export function Vault({ onAddAsset, onImport, customAssets }) {
  const ui = useDesignStore((s) => s.ui);
  const toggleVaultSection = useDesignStore((s) => s.toggleVaultSection);
  const setUi = useDesignStore((s) => s.setUi);

  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState(null);

  /** Groups after applying the search filter. */
  const groups = useMemo(() => searchAssets(query), [query]);
  const stats = useMemo(() => libraryStats(), []);

  /** Active default finish for newly placed artwork. */
  const activeFinish = useDesignStore((s) => s.ui.vaultFinish || 'gold');

  return (
    <aside className="flex flex-col h-full min-w-0">
      {/* Header ------------------------------------------------------ */}
      <div className="panel-header">
        <span className="flex items-center gap-1.5">
          <IconSparkle size={12} className="text-gold-400/70" />
          The Vault
        </span>
        <span className="chip tnum">{stats.total} assets</span>
      </div>

      {/* Search ------------------------------------------------------ */}
      <div className="p-2 border-b border-white/[0.05] space-y-2">
        <div className="relative">
          <IconSearch size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search runes, frames, moon…"
            className="field pl-7 pr-6"
            spellCheck={false}
            aria-label="Search the vault"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-300 text-[13px] leading-none"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Default finish selector — the "material" applied on drop. */}
        <FinishStrip
          value={activeFinish}
          onChange={(id) => setUi({ vaultFinish: id })}
        />
      </div>

      {/* Groups ------------------------------------------------------ */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {groups.length === 0 && (
          <EmptyState
            icon={<IconSearch size={22} />}
            title="Nothing in the vault matches"
            body={`No assets tagged “${query}”. Try “moon”, “rune”, “knot” or “shield”.`}
          />
        )}

        {groups.map((group) => {
          const open = ui.vaultOpen[group.id] ?? false;
          const GroupIcon = GROUP_ICONS[group.id] || IconSparkle;
          return (
            <section key={group.id} className="border-b border-white/[0.05]">
              <button
                type="button"
                onClick={() => toggleVaultSection(group.id)}
                className="acc-trigger sticky top-0 z-[1] bg-void-800/95 backdrop-blur-sm"
              >
                <IconChevron open={open} className="text-gold-400/50 shrink-0" />
                <GroupIcon size={12} className="text-gold-400/60 shrink-0" />
                <span className="flex-1 truncate">{group.label}</span>
                <span className="text-[9px] text-neutral-600 tnum pr-1">{group.items.length}</span>
              </button>

              {open && (
                <div className="px-2 pb-3 animate-fade-in">
                  <p className="text-[10px] text-neutral-600 leading-snug px-1 pb-2">{group.blurb}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {group.items.map((item) => (
                      <AssetTile
                        key={item.id}
                        item={item}
                        onAdd={onAddAsset}
                        onHover={setHovered}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}

        {/* Custom imports ------------------------------------------- */}
        <section className="border-b border-white/[0.05]">
          <button
            type="button"
            onClick={() => toggleVaultSection('custom')}
            className="acc-trigger sticky top-0 z-[1] bg-void-800/95 backdrop-blur-sm"
          >
            <IconChevron open={ui.vaultOpen.custom} className="text-gold-400/50 shrink-0" />
            <IconImport size={12} className="text-gold-400/60 shrink-0" />
            <span className="flex-1 truncate">Custom Imports</span>
            <span className="text-[9px] text-neutral-600 tnum pr-1">{customAssets.length}</span>
          </button>

          {ui.vaultOpen.custom && (
            <div className="px-2 pb-3 animate-fade-in">
              <p className="text-[10px] text-neutral-600 leading-snug px-1 pb-2">
                Drop in your own SVG or PNG artwork. Imports stay on this machine.
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {customAssets.map((item) => (
                  <AssetTile key={item.id} item={item} onAdd={onAddAsset} onHover={setHovered} custom />
                ))}
                <button
                  type="button"
                  onClick={onImport}
                  className="asset-tile aspect-square flex-col gap-1 text-neutral-500 hover:text-gold-300"
                  title="Import SVG or image"
                >
                  <IconPlus size={16} />
                  <span className="text-[9px] uppercase tracking-wider">Import</span>
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="px-3 py-3 text-[9px] leading-relaxed text-neutral-700">
          All bundled artwork is CC0 — free for personal and commercial marks.
        </div>
      </div>

      {/* Footer ------------------------------------------------------ */}
      <div className="border-t border-white/[0.05] px-2 py-2 flex gap-1.5">
        <button type="button" className="btn flex-1" onClick={onImport}>
          <IconImport size={13} />
          Import
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          title="Open the user vault folder"
          onClick={() => window.desktop?.shell?.openVaultFolder()}
        >
          <IconFolder size={13} />
        </button>
      </div>
    </aside>
  );
}

/**
 * A single draggable asset thumbnail.
 * @param {{item: object, onAdd: Function, onHover: Function, custom?: boolean}} props
 */
function AssetTile({ item, onAdd, onHover, custom }) {
  const [svg, setSvg] = useState(item.thumbSvg || null);
  const mounted = useRef(true);

  // Lazily resolve the SVG source for the thumbnail (and drag payload).
  useEffect(() => {
    mounted.current = true;
    if (item.thumbSvg) {
      setSvg(item.thumbSvg);
      return () => {
        mounted.current = false;
      };
    }
    loadAsset(item)
      .then((loaded) => {
        if (mounted.current) setSvg(loaded.svg);
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, [item]);

  /** Build the drag payload so the canvas can place it at the cursor. */
  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'copy';
    const payload = JSON.stringify({ type: 'plm-asset', id: item.id, name: item.name });
    e.dataTransfer.setData('application/x-plm-asset', payload);
    e.dataTransfer.setData('text/plain', item.name);
  };

  const thumb = useMemo(() => {
    if (!svg) return null;
    if (item.kind === 'raster') return item.dataUrl;
    return svgThumb(svg);
  }, [svg, item]);

  return (
    <button
      type="button"
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={() => onHover(item)}
      onClick={() => onAdd(item)}
      title={`${item.name}\nClick to place · drag onto canvas`}
      className="asset-tile aspect-square group"
    >
      {thumb ? (
        <img src={thumb} alt={item.name} draggable={false} loading="lazy" />
      ) : (
        <div className="w-full h-full animate-pulse-slow bg-white/[0.03]" />
      )}
      <span
        className="absolute inset-x-0 bottom-0 px-1 py-[3px] text-[8px] leading-tight text-center
                   text-neutral-300 bg-gradient-to-t from-void-900/95 to-transparent
                   opacity-0 group-hover:opacity-100 transition-opacity truncate"
      >
        {item.name}
      </span>
      {item.curated === false && (
        <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-gold-400/70" />
      )}
    </button>
  );
}

/**
 * Horizontal finish picker — sets the material applied to newly placed symbols.
 * @param {{value: string, onChange: (id:string)=>void}} props
 */
function FinishStrip({ value, onChange }) {
  const FINISH_SHORTCUTS = ['gold', 'copper', 'silver', 'stone', 'ember', 'obsidian', 'flat-gold'];
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] uppercase tracking-[0.14em] text-neutral-600 shrink-0">Finish</span>
      <div className="flex flex-1 gap-1 justify-end">
        {FINISH_SHORTCUTS.map((id) => {
          const finish = getFinish(id);
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              title={finish.label}
              aria-label={`Use ${finish.label}`}
              aria-pressed={active}
              className={`w-5 h-5 rounded-full border transition-all
                ${active ? 'border-gold-200 scale-110 shadow-glow' : 'border-white/15 hover:border-gold-400/60'}`}
              style={{ background: finishToCss(id, 140) }}
            />
          );
        })}
      </div>
    </div>
  );
}
