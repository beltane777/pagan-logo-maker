/**
 * @file src/renderer/components/StatusBar.jsx
 * @description Bottom strip: selection summary, artboard/zoom readout, layer
 * count and save state. Deliberately quiet — it should read at a glance.
 */

import React from 'react';
import { useDesignStore } from '../store/useDesignStore';
import { IconMoon, IconSparkle } from './ui/Icons';

export function StatusBar() {
  const layers = useDesignStore((s) => s.doc.layers);
  const selection = useDesignStore((s) => s.selection);
  const artboard = useDesignStore((s) => s.doc.artboard);
  const ui = useDesignStore((s) => s.ui);

  const selectedLabel =
    selection.length === 0
      ? 'No selection'
      : selection.length === 1
        ? layers.find((l) => l.id === selection[0])?.name || 'Layer'
        : `${selection.length} layers selected`;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-gold-400/10 bg-void-900/80 px-3
                       text-[10px] text-neutral-600 select-none">
      <span className="flex items-center gap-1.5 text-neutral-500">
        <span className="w-1 h-1 rounded-full bg-moss-400" />
        Ready
      </span>

      <span className="h-3 w-px bg-white/10" />

      <span className="truncate max-w-[240px]">{selectedLabel}</span>

      <span className="ml-auto flex items-center gap-3 tnum">
        <span>
          {artboard.width} × {artboard.height}
        </span>
        <span className="text-neutral-700">|</span>
        <span>{Math.round(ui.zoom * 100)}%</span>
        <span className="text-neutral-700">|</span>
        <span>{layers.length} layers</span>
        <span className="text-neutral-700">|</span>
        <span className={ui.dirty ? 'text-gold-400/80' : 'text-moss-400/80'}>
          {ui.dirty ? 'Unsaved' : 'Saved'}
        </span>
      </span>
    </footer>
  );
}
