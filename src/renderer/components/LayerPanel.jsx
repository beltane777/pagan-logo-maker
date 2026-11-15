/**
 * @file src/renderer/components/LayerPanel.jsx
 * @description The layer stack: drag-and-drop reordering, per-layer visibility
 * and lock toggles, inline rename, grouping, and a right-click context menu.
 *
 * The panel renders top-most layer first (like every design tool), while Fabric
 * stacks bottom-first — `sortedLayers` handles the inversion for display.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useDesignStore } from '../store/useDesignStore';
import {
  IconEye,
  IconLock,
  IconGrip,
  IconTrash,
  IconCopy,
  IconGroup,
  IconUngroup,
  IconMoveUp,
  IconMoveDown,
  KIND_ICONS,
} from './ui/Icons';
import { EmptyState } from './ui/Controls';

/** @typedef {import('../canvas/engine').LayerMeta} LayerMeta */

/**
 * @param {{engineRef: React.MutableRefObject<any>, onSelectLayer: Function,
 *   onLayerProps: Function, onDelete: Function, onDuplicate: Function,
 *   onReorder: Function}} props
 */
export function LayerPanel({ onSelectLayer, onLayerProps, onDelete, onDuplicate, onReorder }) {
  const layers = useDesignStore((s) => s.doc.layers);
  const selection = useDesignStore((s) => s.selection);
  const [dragId, setDragId] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [renamingId, setRenamingId] = useState(null);

  /** Display order: top-most first. */
  const sorted = useMemo(() => [...layers].reverse(), [layers]);

  const handleDrop = (targetId) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDropIndex(null);
      return;
    }
    const fromIdx = layers.findIndex((l) => l.id === dragId);
    const toIdx = layers.findIndex((l) => l.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    onReorder(dragId, toIdx);
    setDragId(null);
    setDropIndex(null);
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="panel-header !h-8">
        <span>Layers</span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-icon !w-5 !h-5"
            title="Group selection (⌘G)"
            onClick={() => engineRef.current?.groupSelection()}
            disabled={selection.length < 2}
          >
            <IconGroup size={12} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon !w-5 !h-5"
            title="Ungroup (⇧⌘G)"
            onClick={() => engineRef.current?.ungroupSelection()}
            disabled={selection.length === 0}
          >
            <IconUngroup size={12} />
          </button>
          <span className="text-[9px] text-neutral-600 tnum ml-1">{layers.length}</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-1.5 space-y-0.5">
        {sorted.length === 0 && (
          <EmptyState
            title="The canvas is empty"
            body="Drag a symbol from the Vault, or press ⌘N to start a new sigil."
          />
        )}

        {sorted.map((layer, displayIndex) => {
          const Icon = KIND_ICONS[layer.kind] || KIND_ICONS.shape;
          const isSelected = selection.includes(layer.id);
          return (
            <div
              key={layer.id}
              draggable
              onDragStart={(e) => {
                setDragId(layer.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', layer.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropIndex(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDropIndex(displayIndex);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(layer.id);
              }}
              onClick={(e) => onSelectLayer(layer.id, e.shiftKey || e.metaKey || e.ctrlKey)}
              onDoubleClick={() => setRenamingId(layer.id)}
              data-selected={isSelected}
              data-dragging={dragId === layer.id}
              data-drop={dropIndex === displayIndex && dragId && dragId !== layer.id}
              className="layer-row group"
              role="option"
              aria-selected={isSelected}
              title={layer.name}
            >
              <IconGrip size={11} className="text-neutral-700 group-hover:text-neutral-500 shrink-0 cursor-grab" />

              {/* Thumbnail */}
              <div className="w-6 h-6 rounded-[4px] bg-void-900/80 border border-white/[0.06] shrink-0 grid place-items-center overflow-hidden">
                {layer.thumb ? (
                  <img src={layer.thumb} alt="" className="w-full h-full object-contain p-0.5" draggable={false} />
                ) : (
                  <Icon size={12} className="text-neutral-600" />
                )}
              </div>

              {/* Name / rename */}
              <div className="flex-1 min-w-0">
                {renamingId === layer.id ? (
                  <RenameInput
                    value={layer.name}
                    onCommit={(name) => {
                      if (name.trim() && name !== layer.name) onLayerProps(layer.id, { name });
                      setRenamingId(null);
                    }}
                  />
                ) : (
                  <p
                    className={`truncate text-[11px] leading-tight ${
                      isSelected ? 'text-parchment' : 'text-neutral-400'
                    } ${layer.visible === false ? 'opacity-40 line-through' : ''}`}
                  >
                    {layer.name}
                  </p>
                )}
                <LayerBadge layer={layer} />
              </div>

              {/* Toggles */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLayerProps(layer.id, { locked: !layer.locked });
                }}
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                className={`btn btn-ghost btn-icon !w-5 !h-5 shrink-0 ${
                  layer.locked ? '!text-gold-400' : 'opacity-0 group-hover:opacity-60'
                }`}
              >
                <IconLock size={11} locked={layer.locked} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLayerProps(layer.id, { visible: layer.visible === false });
                }}
                title={layer.visible === false ? 'Show layer' : 'Hide layer'}
                className={`btn btn-ghost btn-icon !w-5 !h-5 shrink-0 ${
                  layer.visible === false ? '!text-neutral-600' : 'opacity-0 group-hover:opacity-60'
                }`}
              >
                <IconEye size={11} off={layer.visible === false} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Bulk actions ------------------------------------------------ */}
      <div className="flex items-center gap-0.5 border-t border-white/[0.05] px-1.5 py-1">
        <button
          type="button"
          className="btn btn-ghost btn-icon !w-6 !h-6"
          title="Bring forward"
          disabled={!selection.length}
          onClick={() => onReorder(selection[0], 'forward')}
        >
          <IconMoveUp size={12} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon !w-6 !h-6"
          title="Send backward"
          disabled={!selection.length}
          onClick={() => onReorder(selection[0], 'backward')}
        >
          <IconMoveDown size={12} />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          className="btn btn-ghost btn-icon !w-6 !h-6"
          title="Duplicate (⌘D)"
          disabled={!selection.length}
          onClick={() => onDuplicate(selection)}
        >
          <IconCopy size={12} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon !w-6 !h-6 hover:!text-blood-500"
          title="Delete (⌫)"
          disabled={!selection.length}
          onClick={() => onDelete(selection)}
        >
          <IconTrash size={12} />
        </button>
      </div>
    </div>
  );
}

/**
 * Inline rename field that commits on blur/Enter.
 * @param {{value: string, onCommit: (v:string)=>void}} props
 */
function RenameInput({ value, onCommit }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  React.useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(draft);
        if (e.key === 'Escape') onCommit(value);
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full bg-void-900 border border-gold-400/40 rounded px-1 py-0 text-[11px] text-parchment outline-none"
    />
  );
}

/**
 * Secondary metadata line: kind + finish / opacity.
 * @param {{layer: LayerMeta}} props
 */
function LayerBadge({ layer }) {
  const label =
    layer.kind === 'text'
      ? `${layer.text?.fontFamily?.split(' ')[0] || 'Text'}${layer.text?.curve ? ' · arc' : ''}`
      : layer.kind === 'symbol' || layer.kind === 'background'
        ? layer.finishId
        : layer.kind === 'group'
          ? `${layer.children?.length || '•'} items`
          : layer.kind;

  return (
    <p className="flex items-center gap-1 text-[8.5px] uppercase tracking-[0.1em] text-neutral-600 truncate">
      <span className="truncate">{label}</span>
      {typeof layer.opacity === 'number' && layer.opacity < 1 && (
        <span className="tnum">· {Math.round(layer.opacity * 100)}%</span>
      )}
    </p>
  );
}
