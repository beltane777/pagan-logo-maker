/**
 * @file src/renderer/components/modals/ShortcutsModal.jsx
 * @description Keyboard reference. Kept in sync with `src/main/menu.js` — if you
 * add an accelerator there, add it here too.
 */

import React from 'react';
import { Modal } from './Modal';
import { IconInfo } from '../ui/Icons';

/** Accelerator reference, grouped by intent. */
const GROUPS = [
  {
    title: 'Project',
    items: [
      ['New project', '⌘N'],
      ['Open project', '⌘O'],
      ['Save', '⌘S'],
      ['Save as template', '⌘⌥S'],
      ['Export', '⌘E'],
      ['Quick export PNG', '⇧⌘E'],
    ],
  },
  {
    title: 'Editing',
    items: [
      ['Undo / Redo', '⌘Z / ⇧⌘Z'],
      ['Duplicate', '⌘D'],
      ['Delete', '⌫'],
      ['Select all', '⌘A'],
      ['Group / Ungroup', '⌘G / ⇧⌘G'],
      ['Nudge 1px / 10px', '↑↓←→ / ⇧+arrows'],
      ['Lock layer', '⌘L'],
    ],
  },
  {
    title: 'View',
    items: [
      ['Zoom in / out', '⌘+ / ⌘−'],
      ['Fit artboard', '⌘0'],
      ['Actual size', '⌘1'],
      ['Zoom with wheel', '⌘ + scroll'],
      ['Toggle grid', "⌘'"],
      ['Toggle snapping', '⌘;'],
      ['Toggle Vault', '⌘B'],
    ],
  },
  {
    title: 'Canvas',
    items: [
      ['Pan', 'Space + drag'],
      ['Scale uniformly', '⇧ + corner drag'],
      ['Rotate in 15° steps', '⇧ + rotate handle'],
      ['Deselect', 'Esc'],
    ],
  },
];

/** @param {{onClose: Function}} props */
export function ShortcutsModal({ onClose }) {
  return (
    <Modal
      title="Keyboard Shortcuts"
      subtitle="On Windows and Linux, ⌘ is Ctrl"
      onClose={onClose}
      icon={<IconInfo size={18} />}
      width={620}
      footer={
        <button type="button" className="btn btn-gold" onClick={onClose}>
          Got it
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-gold-300/80 mb-1.5">{group.title}</h3>
            <ul className="space-y-1">
              {group.items.map(([label, keys]) => (
                <li key={label} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-neutral-400">{label}</span>
                  <span className="flex gap-1 shrink-0">
                    {keys.split(' / ').map((chord) => (
                      <span key={chord} className="kbd">
                        {chord}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
