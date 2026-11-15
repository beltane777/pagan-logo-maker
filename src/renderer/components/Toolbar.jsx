/**
 * @file src/renderer/components/Toolbar.jsx
 * @description The quick-action strip. Kept narrow (icons + tooltips) because
 * screen real estate belongs to the canvas; every action here is also on the
 * native menu.
 */

import React from 'react';
import {
  IconNew,
  IconSave,
  IconExport,
  IconUndo,
  IconRedo,
} from './ui/Icons';

/**
 * @param {{onNew: Function, onSave: Function, onExport: Function,
 *   onUndo: Function, onRedo: Function, canUndo: boolean, canRedo: boolean}} props
 */
export function Toolbar({ onNew, onSave, onExport, onUndo, onRedo, canUndo, canRedo }) {
  return (
    <div className="flex items-center gap-0.5">
      <ActionButton label="New Project" shortcut="⌘N" onClick={onNew}>
        <IconNew size={15} />
      </ActionButton>
      <ActionButton label="Save Template" shortcut="⌘⌥S" onClick={onSave}>
        <IconSave size={15} />
      </ActionButton>
      <ActionButton label="Export Design" shortcut="⌘E" onClick={onExport} accent>
        <IconExport size={15} />
        <span className="hidden lg:inline text-[11px] font-semibold">Export</span>
      </ActionButton>

      <div className="h-5 w-px bg-white/10 mx-1" />

      <ActionButton label="Undo" shortcut="⌘Z" onClick={onUndo} disabled={!canUndo}>
        <IconUndo size={15} />
      </ActionButton>
      <ActionButton label="Redo" shortcut="⇧⌘Z" onClick={onRedo} disabled={!canRedo}>
        <IconRedo size={15} />
      </ActionButton>
    </div>
  );
}

/**
 * Icon button with an accessible tooltip.
 * @param {{label: string, shortcut?: string, onClick: Function, children: React.ReactNode,
 *   disabled?: boolean, accent?: boolean}} props
 */
function ActionButton({ label, shortcut, onClick, children, disabled, accent }) {
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`btn btn-icon ${accent ? 'btn-gold !w-auto px-2.5 gap-1.5' : ''}`}
      >
        {children}
      </button>
      <div
        className="pointer-events-none absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 z-50
                   whitespace-nowrap rounded-md border border-gold-400/20 bg-void-900/95 px-2 py-1
                   text-[10px] text-neutral-300 opacity-0 translate-y-[-2px] transition-all
                   group-hover:opacity-100 group-hover:translate-y-0 shadow-xl"
      >
        {label}
        {shortcut && <span className="ml-1.5 text-neutral-600">{shortcut}</span>}
      </div>
    </div>
  );
}
